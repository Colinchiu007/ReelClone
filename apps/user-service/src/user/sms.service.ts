/**
 * 短信验证码服务
 *
 * 职责：
 * - 发送验证码（Mock 模式 + 真实 SMS 模式）
 * - 校验验证码
 * - Redis 限流：同一手机号 60s 内只能发一次
 *
 * Mock 模式（SMS_MOCK_MODE=true 或 SMS_ACCESS_KEY_ID 为空）：
 * - 验证码固定为 123456
 * - 通过日志打印，不真实发送
 *
 * Redis Key 设计：
 * - sms:code:{mobile}:{purpose} → code（TTL 300s）
 * - sms:lockout:{mobile} → 1（TTL 60s，防重复发送）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import Redis from 'ioredis'
import * as crypto from 'crypto'
import { SmsCode, SmsCodePurpose, DATABASE_CONNECTIONS, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'

/** 验证码默认过期时间（秒） */
const CODE_EXPIRE_SECONDS = 300

/** 发送间隔锁定时间（秒） */
const SEND_LOCKOUT_SECONDS = 60

/** 验证码最大尝试次数 */
const MAX_VERIFY_ATTEMPTS = 5

/** Mock 模式固定验证码 */
const MOCK_CODE = '123456'

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name)

  constructor(
    @InjectRepository(SmsCode, DATABASE_CONNECTIONS.MAIN)
    private readonly smsCodeRepository: Repository<SmsCode>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * 是否为 Mock 模式
   */
  isMockMode(): boolean {
    return process.env.SMS_MOCK_MODE === 'true' || !process.env.SMS_ACCESS_KEY_ID
  }

  /**
   * 生产环境安全检查：禁止 Mock 模式启动
   */
  private assertNotMockInProduction(): void {
    if (process.env.NODE_ENV === 'production' && this.isMockMode()) {
      throw new Error(
        'SMS 服务在生产环境中不允许使用 Mock 模式，请配置 SMS_ACCESS_KEY_ID 或设置 SMS_MOCK_MODE=false',
      )
    }
  }

  /**
   * 发送短信验证码
   *
   * @param mobile 手机号
   * @param purpose 用途
   * @returns 生成的验证码（Mock 模式下返回固定值）
   */
  async sendCode(mobile: string, purpose: SmsCodePurpose): Promise<string> {
    this.assertNotMockInProduction()

    const lockoutKey = `sms:lockout:${mobile}`
    const codeKey = `sms:code:${mobile}:${purpose}`

    // 1. 检查发送间隔锁（同一手机号 60s 内只能发一次）
    const lockoutExists = await this.redis.exists(lockoutKey)
    if (lockoutExists) {
      const ttl = await this.redis.ttl(lockoutKey)
      throw new BusinessException(ErrorCode.RATE_LIMITED, `验证码已发送，请 ${ttl} 秒后重试`, {
        mobile,
        retryAfter: ttl,
      })
    }

    // 2. 生成验证码
    const code = this.isMockMode() ? MOCK_CODE : this.generateRandomCode()

    // 3. 存入 Redis（TTL 300s）
    await this.redis.set(codeKey, code, 'EX', CODE_EXPIRE_SECONDS)

    // 4. 设置发送间隔锁（TTL 60s）
    await this.redis.set(lockoutKey, '1', 'EX', SEND_LOCKOUT_SECONDS)

    // 5. 持久化到数据库（审计记录）
    const expiredAt = new Date(Date.now() + CODE_EXPIRE_SECONDS * 1000)
    const smsCode = this.smsCodeRepository.create({
      mobile,
      code,
      purpose,
      expiredAt,
      usedAt: null,
    })
    await this.smsCodeRepository.save(smsCode)

    // 6. 发送（Mock 模式仅日志，真实模式调用 SMS API）
    if (this.isMockMode()) {
      this.logger.log(
        `[Mock SMS] mobile=${mobile}, purpose=${purpose}, code=${code.slice(0, 2)}***`,
      )
    } else {
      await this.sendRealSms(mobile, code)
    }

    return code
  }

  /**
   * 校验验证码
   *
   * @param mobile 手机号
   * @param purpose 用途
   * @param code 用户输入的验证码
   * @throws BusinessException 验证码错误/过期/已使用
   */
  async verifyCode(mobile: string, purpose: SmsCodePurpose, code: string): Promise<void> {
    const codeKey = `sms:code:${mobile}:${purpose}`
    const attemptsKey = `sms:attempts:${mobile}:${purpose}`

    // 1. 检查尝试次数（防暴力破解）
    const attempts = await this.redis.incr(attemptsKey)
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, CODE_EXPIRE_SECONDS)
    }
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      // 超过最大尝试次数，删除验证码并锁定
      await this.redis.del(codeKey)
      throw new BusinessException(ErrorCode.RATE_LIMITED, `验证码错误次数过多，请重新获取`, {
        mobile,
        attempts,
      })
    }

    // 2. 从 Redis 读取验证码
    const storedCode = await this.redis.get(codeKey)

    if (!storedCode) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '验证码不存在或已过期，请重新获取', {
        mobile,
        purpose,
      })
    }

    // 3. 比对验证码
    if (storedCode !== code) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '验证码不正确', {
        mobile,
        remainingAttempts: MAX_VERIFY_ATTEMPTS - attempts,
      })
    }

    // 4. 校验成功，删除 Redis 中的验证码和尝试计数（防止重复使用）
    await this.redis.del(codeKey)
    await this.redis.del(attemptsKey)

    // 5. 标记数据库中的验证码记录为已使用
    await this.markCodeAsUsed(mobile, purpose, code)
  }

  /**
   * 将数据库中匹配的验证码记录标记为已使用
   */
  private async markCodeAsUsed(
    mobile: string,
    purpose: SmsCodePurpose,
    code: string,
  ): Promise<void> {
    try {
      // 查找最近一条未使用的匹配记录
      const smsCode = await this.smsCodeRepository.findOne({
        where: { mobile, purpose, code, usedAt: IsNull() },
        order: { createdAt: 'DESC' },
      })

      if (smsCode) {
        await this.smsCodeRepository.update(smsCode.id, {
          usedAt: new Date(),
        })
      }
    } catch (err) {
      // 标记失败不影响主流程（Redis 已删除验证码）
      this.logger.warn(`Failed to mark SMS code as used: ${(err as Error).message}`)
    }
  }

  /**
   * 生成 6 位随机数字验证码（密码学安全）
   */
  private generateRandomCode(): string {
    return crypto.randomInt(100000, 1000000).toString()
  }

  /**
   * 调用真实短信服务商 API 发送验证码
   * （占位实现，实际项目对接阿里云/腾讯云短信）
   */
  private async sendRealSms(_mobile: string, _code: string): Promise<void> {
    // 真实模式未实现时抛错，避免静默成功
    throw new Error(
      'SmsService.sendRealSms: 真实 SMS 发送未实现，请配置 SMS_MOCK_MODE=true 或补充真实实现',
    )
  }
}
