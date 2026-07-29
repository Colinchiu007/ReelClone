/**
 * SmsService 单元测试
 *
 * 测试范围：
 * - sendCode：Mock 模式 / 限流（lockout）
 * - verifyCode：成功 / 失败 / 过期（不存在）/ 已使用（删除后不存在）
 */
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import Redis from 'ioredis'
import { SmsService } from './sms.service'
import { SmsCode, SmsCodePurpose, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'

// -------------------- Mock 工厂 --------------------

function createRedisMock(): jest.Mocked<Redis> {
  const store = new Map<string, string>()
  const counters = new Map<string, number>()
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ..._args: unknown[]) => {
      store.set(key, value)
      return 'OK'
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key)
      counters.delete(key)
      return 1
    }),
    exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    ttl: jest.fn(async () => 60),
    incr: jest.fn(async (key: string) => {
      const val = (counters.get(key) ?? 0) + 1
      counters.set(key, val)
      return val
    }),
    expire: jest.fn(async () => 1),
  } as unknown as jest.Mocked<Redis>
}

function createSmsCodeRepoMock(): jest.Mocked<Repository<SmsCode>> {
  return {
    create: jest.fn((entity: Partial<SmsCode>) => ({ ...entity }) as SmsCode),
    save: jest.fn(async (entity: SmsCode) => ({ ...entity, id: 'uuid-1' }) as SmsCode),
    findOne: jest.fn(async () => null),
    update: jest.fn(async () => ({ affected: 1, generatedMaps: [], raw: {} })),
  } as unknown as jest.Mocked<Repository<SmsCode>>
}

// -------------------- 测试 --------------------

describe('SmsService', () => {
  let service: SmsService
  let redis: jest.Mocked<Redis>
  let smsCodeRepo: jest.Mocked<Repository<SmsCode>>

  beforeEach(async () => {
    process.env.SMS_MOCK_MODE = 'true'
    process.env.SMS_ACCESS_KEY_ID = ''

    redis = createRedisMock()
    smsCodeRepo = createSmsCodeRepoMock()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile()

    service = module.get<SmsService>(SmsService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- sendCode --------------------

  describe('sendCode', () => {
    it('Mock 模式下应返回固定验证码 123456', async () => {
      const code = await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      expect(code).toBe('123456')
      // Redis 应存储验证码
      expect(redis.set).toHaveBeenCalledWith(
        'sms:code:13800138000:BIND_MOBILE',
        '123456',
        'EX',
        300,
      )
      // Redis 应设置 lockout
      expect(redis.set).toHaveBeenCalledWith('sms:lockout:13800138000', '1', 'EX', 60)
      // 应持久化到数据库
      expect(smsCodeRepo.save).toHaveBeenCalledTimes(1)
    })

    it('lockout 存在时应抛出限流异常', async () => {
      // 模拟 lockout 已存在（持续返回 1）
      ;(redis.exists as jest.Mock).mockResolvedValue(1)

      try {
        await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)
        fail('应抛出限流异常')
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException)
        expect((err as BusinessException).code).toBe(ErrorCode.RATE_LIMITED)
      }
    })
  })

  // -------------------- verifyCode --------------------

  describe('verifyCode', () => {
    it('验证码正确时应校验成功并删除 Redis 中的验证码', async () => {
      // 预置 Redis 中的验证码
      ;(redis.get as jest.Mock).mockResolvedValueOnce('123456')

      await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456')

      // 应删除 Redis 中的验证码
      expect(redis.del).toHaveBeenCalledWith('sms:code:13800138000:BIND_MOBILE')
      // 应尝试标记数据库记录为已使用
      expect(smsCodeRepo.findOne).toHaveBeenCalled()
    })

    it('验证码不存在（已过期）时应抛出异常', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)

      try {
        await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456')
        fail('应抛出异常')
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException)
        expect((err as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
        expect((err as BusinessException).message).toContain('过期')
      }
    })

    it('验证码不正确时应抛出异常', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce('123456')

      try {
        await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '999999')
        fail('应抛出异常')
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException)
        expect((err as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
        expect((err as BusinessException).message).toContain('不正确')
      }
    })

    it('验证码已使用（Redis 中已删除）时应抛出过期异常', async () => {
      // 模拟验证码已被删除（第二次调用时 Redis 返回 null）
      ;(redis.get as jest.Mock).mockResolvedValueOnce('123456')

      // 第一次校验成功
      await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456')

      // 第二次校验应失败（验证码已删除）
      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)
      await expect(
        service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456'),
      ).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- isMockMode --------------------

  describe('isMockMode', () => {
    it('SMS_MOCK_MODE=true 时返回 true', () => {
      process.env.SMS_MOCK_MODE = 'true'
      expect(service.isMockMode()).toBe(true)
    })

    it('SMS_ACCESS_KEY_ID 为空时返回 true', () => {
      process.env.SMS_MOCK_MODE = 'false'
      process.env.SMS_ACCESS_KEY_ID = ''
      expect(service.isMockMode()).toBe(true)
    })

    it('SMS_MOCK_MODE=false 且 SMS_ACCESS_KEY_ID 有值时返回 false', () => {
      process.env.SMS_MOCK_MODE = 'false'
      process.env.SMS_ACCESS_KEY_ID = 'real_key'
      expect(service.isMockMode()).toBe(false)
    })
  })
})
