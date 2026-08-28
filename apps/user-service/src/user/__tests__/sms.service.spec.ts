/**
 * SmsService 单元测试（SubTask A4.4）
 *
 * 测试范围：
 * - 显式 @Inject('SMS_ADAPTER') 注入：service 通过 SMS_ADAPTER token 获取 SmsAdapter
 * - provider 切换：service 不感知具体 adapter，行为只依赖 adapter.isMock / sendSms 返回值
 * - sendCode：Mock 模式（固定码）/ Real 模式（随机码）/ 限流（lockout）/ messageId 写入 DB
 * - verifyCode：成功 / 失败 / 过期 / 5 次尝试限制
 * - adapter.sendSms 抛错时 service 向上抛出且不写 messageId
 */
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import Redis from 'ioredis'
import { SmsService } from '../sms.service'
import { SmsCode, SmsCodePurpose, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
import {
  SMS_ADAPTER,
  type SmsAdapter,
  type SmsSendResult,
  MockSmsAdapter,
  AliyunSmsAdapter,
  TencentSmsAdapter,
  createSmsAdapter,
} from '@reelclone/adapters-sms'

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
    save: jest.fn(
      async (entity: SmsCode) =>
        ({
          ...entity,
          id: 'uuid-1',
        }) as SmsCode,
    ),
    findOne: jest.fn(async () => null),
    update: jest.fn(async () => ({ affected: 1, generatedMaps: [], raw: {} })),
  } as unknown as jest.Mocked<Repository<SmsCode>>
}

/**
 * 创建可控的 SmsAdapter mock
 *
 * isMock 为 readonly 属性，通过 Object.defineProperty 设置以支持测试期间切换。
 */
function createAdapterMock(
  options: {
    isMock?: boolean
    sendSmsResult?: SmsSendResult
    sendSmsImpl?: jest.Mock
  } = {},
): jest.Mocked<SmsAdapter> {
  const adapter: SmsAdapter = {
    get isMock() {
      return options.isMock ?? false
    },
    sendSms:
      options.sendSmsImpl ??
      jest.fn(async (): Promise<SmsSendResult> => {
        return options.sendSmsResult ?? { messageId: 'provider-msg-1', status: 'sent' }
      }),
  } as SmsAdapter
  return adapter as jest.Mocked<SmsAdapter>
}

/** 在运行时切换 adapter 的 isMock 标志（绕过 readonly 约束，便于测试） */
function setAdapterIsMock(adapter: SmsAdapter, value: boolean): void {
  Object.defineProperty(adapter, 'isMock', {
    value,
    configurable: true,
  })
}

/** ConfigService mock：get 默认返回 undefined，触发 service 默认值回退；可用 configValues 定制 */
function createConfigMock(configValues: Record<string, string> = {}): { get: jest.Mock } {
  return {
    get: jest.fn((key: string) => configValues[key] ?? undefined),
  }
}

// -------------------- 测试 --------------------

describe('SmsService', () => {
  let service: SmsService
  let redis: jest.Mocked<Redis>
  let smsCodeRepo: jest.Mocked<Repository<SmsCode>>
  let smsAdapter: jest.Mocked<SmsAdapter>

  beforeEach(async () => {
    redis = createRedisMock()
    smsCodeRepo = createSmsCodeRepoMock()
    smsAdapter = createAdapterMock({ isMock: true })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        // 显式注入 SMS_ADAPTER token（验证 @Inject('SMS_ADAPTER') 装饰器）
        { provide: SMS_ADAPTER, useValue: smsAdapter },
        { provide: ConfigService, useValue: createConfigMock() },
      ],
    }).compile()

    service = module.get<SmsService>(SmsService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- 显式注入 --------------------

  describe('显式 @Inject(SMS_ADAPTER) 注入', () => {
    it('应通过 SMS_ADAPTER token 注入 SmsAdapter', () => {
      // service.isMockMode() 直接读取 adapter.isMock
      expect(service.isMockMode()).toBe(true)
    })

    it('注入 Mock adapter 时 isMockMode() 返回 true', async () => {
      const mockAdapter = new MockSmsAdapter()
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: SMS_ADAPTER, useValue: mockAdapter },
          { provide: ConfigService, useValue: createConfigMock() },
        ],
      }).compile()
      const svc = module.get<SmsService>(SmsService)
      expect(svc.isMockMode()).toBe(true)
    })

    it('注入 Real adapter 时 isMockMode() 返回 false', async () => {
      const realAdapter = new AliyunSmsAdapter({
        accessKeyId: 'k',
        accessKeySecret: 's',
        signName: 'sign',
      })
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: SMS_ADAPTER, useValue: realAdapter },
          { provide: ConfigService, useValue: createConfigMock() },
        ],
      }).compile()
      const svc = module.get<SmsService>(SmsService)
      expect(svc.isMockMode()).toBe(false)
    })
  })

  // -------------------- provider 切换 --------------------

  describe('provider 切换（service 不感知具体 adapter 实现）', () => {
    it('createSmsAdapter 在 test profile 返回 MockSmsAdapter', () => {
      const original = process.env.NODE_ENV
      process.env.NODE_ENV = 'test'
      try {
        const adapter = createSmsAdapter()
        expect(adapter).toBeInstanceOf(MockSmsAdapter)
      } finally {
        process.env.NODE_ENV = original
      }
    })

    it('createSmsAdapter + aliyun 凭证返回 AliyunSmsAdapter', () => {
      const original = { ...process.env }
      process.env.NODE_ENV = 'development'
      process.env.SMS_PROVIDER = 'aliyun'
      process.env.SMS_ALIYUN_ACCESS_KEY_ID = 'k'
      process.env.SMS_ALIYUN_ACCESS_KEY_SECRET = 's'
      try {
        const adapter = createSmsAdapter()
        expect(adapter).toBeInstanceOf(AliyunSmsAdapter)
      } finally {
        process.env = original
      }
    })

    it('createSmsAdapter + tencent 凭证返回 TencentSmsAdapter', () => {
      const original = { ...process.env }
      process.env.NODE_ENV = 'development'
      process.env.SMS_PROVIDER = 'tencent'
      process.env.SMS_TENCENT_SECRET_ID = 'sid'
      process.env.SMS_TENCENT_SECRET_KEY = 'skey'
      process.env.SMS_TENCENT_SDK_APP_ID = '1400000000'
      try {
        const adapter = createSmsAdapter()
        expect(adapter).toBeInstanceOf(TencentSmsAdapter)
      } finally {
        process.env = original
      }
    })

    it('service 调用 sendCode 时使用注入的 adapter.sendSms（不感知 provider 类型）', async () => {
      setAdapterIsMock(smsAdapter, false)
      smsAdapter.sendSms.mockResolvedValueOnce({
        messageId: 'aliyun-biz-123',
        status: 'sent',
      })

      await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      // 应调用 adapter.sendSms 一次，参数为 mobile + templateCode + { code }
      expect(smsAdapter.sendSms).toHaveBeenCalledTimes(1)
      const [phone, templateCode, params] = smsAdapter.sendSms.mock.calls[0]
      expect(phone).toBe('13800138000')
      expect(typeof templateCode).toBe('string')
      expect(params).toHaveProperty('code')
      expect(typeof params.code).toBe('string')
      expect(params.code).toMatch(/^\d{6}$/)
    })
  })

  // -------------------- sendCode --------------------

  describe('sendCode', () => {
    it('Mock 模式下应返回固定验证码 123456', async () => {
      // beforeEach 已设置 isMock=true
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

    it('未配置环境变量时应回退默认 TTL（300s / 60s）', async () => {
      // createConfigMock() 默认 get 返回 undefined → 触发默认值回退
      const code = await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      expect(code).toBe('123456')
      expect(redis.set).toHaveBeenCalledWith(
        'sms:code:13800138000:BIND_MOBILE',
        '123456',
        'EX',
        300,
      )
      expect(redis.set).toHaveBeenCalledWith('sms:lockout:13800138000', '1', 'EX', 60)
    })

    it('配置 SMS_CODE_EXPIRE_SECONDS 时验证码 TTL 使用环境变量值', async () => {
      const config = createConfigMock({ SMS_CODE_EXPIRE_SECONDS: '120' })
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: SMS_ADAPTER, useValue: smsAdapter },
          { provide: ConfigService, useValue: config },
        ],
      }).compile()
      const svc = module.get<SmsService>(SmsService)

      await svc.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      expect(redis.set).toHaveBeenCalledWith(
        'sms:code:13800138000:BIND_MOBILE',
        '123456',
        'EX',
        120,
      )
      // lockout 未配置仍用默认 60
      expect(redis.set).toHaveBeenCalledWith('sms:lockout:13800138000', '1', 'EX', 60)
    })

    it('配置 SMS_SEND_LOCKOUT_SECONDS 时发送间隔锁 TTL 使用环境变量值', async () => {
      const config = createConfigMock({ SMS_SEND_LOCKOUT_SECONDS: '30' })
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: SMS_ADAPTER, useValue: smsAdapter },
          { provide: ConfigService, useValue: config },
        ],
      }).compile()
      const svc = module.get<SmsService>(SmsService)

      await svc.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      expect(redis.set).toHaveBeenCalledWith('sms:lockout:13800138000', '1', 'EX', 30)
      // code 未配置仍用默认 300
      expect(redis.set).toHaveBeenCalledWith(
        'sms:code:13800138000:BIND_MOBILE',
        '123456',
        'EX',
        300,
      )
    })

    it('环境变量为非法值时回退默认 TTL（防御误配置）', async () => {
      const config = createConfigMock({
        SMS_CODE_EXPIRE_SECONDS: 'abc',
        SMS_SEND_LOCKOUT_SECONDS: '-5',
      })
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: getRepositoryToken(SmsCode, 'main'), useValue: smsCodeRepo },
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: SMS_ADAPTER, useValue: smsAdapter },
          { provide: ConfigService, useValue: config },
        ],
      }).compile()
      const svc = module.get<SmsService>(SmsService)

      await svc.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      expect(redis.set).toHaveBeenCalledWith(
        'sms:code:13800138000:BIND_MOBILE',
        '123456',
        'EX',
        300,
      )
      expect(redis.set).toHaveBeenCalledWith('sms:lockout:13800138000', '1', 'EX', 60)
    })

    it('Real 模式下应返回 6 位随机数字验证码', async () => {
      setAdapterIsMock(smsAdapter, false)
      smsAdapter.sendSms.mockResolvedValueOnce({
        messageId: 'biz-1',
        status: 'sent',
      })

      const code = await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      expect(code).toMatch(/^\d{6}$/)
      expect(code).not.toBe('123456')
    })

    it('发送成功后应将 messageId 写入 DB（用于状态查询）', async () => {
      setAdapterIsMock(smsAdapter, false)
      smsAdapter.sendSms.mockResolvedValueOnce({
        messageId: 'aliyun-biz-999',
        status: 'sent',
      })

      await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)

      // smsCodeRepository.update 应被调用，更新 providerMessageId
      expect(smsCodeRepo.update).toHaveBeenCalledWith('uuid-1', {
        providerMessageId: 'aliyun-biz-999',
      })
    })

    it('adapter.sendSms 抛错时应向上抛出且不写入 messageId', async () => {
      setAdapterIsMock(smsAdapter, false)
      const bizErr = new BusinessException(ErrorCode.INTERNAL_ERROR, '短信发送失败：网络异常')
      smsAdapter.sendSms.mockRejectedValueOnce(bizErr)

      await expect(service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)).rejects.toBe(bizErr)

      // 不应调用 update 写 messageId
      // （save 已调用创建记录，但 update 不应被调用更新 messageId）
      expect(smsCodeRepo.update).not.toHaveBeenCalled()
    })

    it('lockout 存在时应抛出限流异常', async () => {
      ;(redis.exists as jest.Mock).mockResolvedValue(1)

      await expect(
        service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE),
      ).rejects.toMatchObject({
        code: ErrorCode.RATE_LIMITED,
      })
    })

    it('应使用 SMS_TEMPLATE_{PURPOSE} 作为 templateCode 传给 adapter', async () => {
      process.env.SMS_TEMPLATE_BIND_MOBILE = 'SMS_BIND_001'
      setAdapterIsMock(smsAdapter, false)
      smsAdapter.sendSms.mockResolvedValueOnce({ messageId: 'm-1', status: 'sent' })

      try {
        await service.sendCode('13800138000', SmsCodePurpose.BIND_MOBILE)
        const templateCode = smsAdapter.sendSms.mock.calls[0][1]
        expect(templateCode).toBe('SMS_BIND_001')
      } finally {
        delete process.env.SMS_TEMPLATE_BIND_MOBILE
      }
    })

    it('未配置 SMS_TEMPLATE_{PURPOSE} 时回退到 SMS_TEMPLATE_CODE', async () => {
      process.env.SMS_TEMPLATE_CODE = 'SMS_DEFAULT'
      setAdapterIsMock(smsAdapter, false)
      smsAdapter.sendSms.mockResolvedValueOnce({ messageId: 'm-2', status: 'sent' })

      try {
        await service.sendCode('13800138000', SmsCodePurpose.RESET_PASSWORD)
        const templateCode = smsAdapter.sendSms.mock.calls[0][1]
        expect(templateCode).toBe('SMS_DEFAULT')
      } finally {
        delete process.env.SMS_TEMPLATE_CODE
      }
    })
  })

  // -------------------- verifyCode --------------------

  describe('verifyCode', () => {
    it('验证码正确时应校验成功并删除 Redis 中的验证码', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce('123456')

      await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456')

      expect(redis.del).toHaveBeenCalledWith('sms:code:13800138000:BIND_MOBILE')
      expect(smsCodeRepo.findOne).toHaveBeenCalled()
    })

    it('验证码不存在（已过期）时应抛出异常', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456'),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR })
    })

    it('验证码不正确时应抛出异常并提示剩余尝试次数', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce('123456')

      try {
        await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '999999')
        fail('应抛出异常')
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException)
        expect((err as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
        expect((err as BusinessException).details).toHaveProperty('remainingAttempts')
      }
    })

    it('5 次尝试限制：第 6 次应抛出限流异常并删除验证码', async () => {
      // 模拟已有 5 次尝试计数
      ;(redis.incr as jest.Mock).mockResolvedValueOnce(6)
      ;(redis.get as jest.Mock).mockResolvedValue('123456')

      try {
        await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456')
        fail('应抛出限流异常')
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException)
        expect((err as BusinessException).code).toBe(ErrorCode.RATE_LIMITED)
      }

      // 超限时应删除验证码
      expect(redis.del).toHaveBeenCalledWith('sms:code:13800138000:BIND_MOBILE')
    })

    it('验证码已使用（Redis 中已删除）时应抛出过期异常', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce('123456')
      await service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456')

      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)
      await expect(
        service.verifyCode('13800138000', SmsCodePurpose.BIND_MOBILE, '123456'),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR })
    })
  })

  // -------------------- isMockMode --------------------

  describe('isMockMode', () => {
    it('注入 Mock adapter 时返回 true', () => {
      setAdapterIsMock(smsAdapter, true)
      expect(service.isMockMode()).toBe(true)
    })

    it('注入 Real adapter 时返回 false', () => {
      setAdapterIsMock(smsAdapter, false)
      expect(service.isMockMode()).toBe(false)
    })
  })
})
