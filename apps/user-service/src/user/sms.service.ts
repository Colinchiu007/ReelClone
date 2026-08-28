/**
 * 短信验证码服务
 *
 * 职责（SubTask A4.3 重构）：
 * - 通过显式 `@Inject('SMS_ADAPTER')` 注入 SmsAdapter，业务函数零分支
 * - 不再有 `if (process.env.NODE_ENV === 'production') throw ...` 占位逻辑
 * - 发送验证码后记录 messageId 到 DB（用于状态查询）
 * - Redis 限流：同一手机号 60s 内只能发一次
 * - 校验验证码：5 次尝试限制（防暴力破解）
 * - 日志脱敏：仅打印验证码前两位
 *
 * Mock 模式（adapter.isMock === true）：
 * - 验证码固定为 123456（便于本地联调与单元测试断言）
 * - 由 MockSmsAdapter 打印日志，不真实发送
 *
 * Redis Key 设计：
 * - sms:code:{mobile}:{purpose} → code（TTL 300s）
 * - sms:lockout:{mobile} → 1（TTL 60s，防重复发送）
 * - sms:attempts:{mobile}:{purpose} → 计数（TTL 300s，5 次尝试限制）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import Redis from 'ioredis'
import * as crypto from 'crypto'
import { SmsCode, SmsCodePurpose, DATABASE_CONNECTIONS, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { SMS_ADAPTER, type SmsAdapter } from '@reelclone/adapters-sms'

/** 验证码默认过期时间（秒），可用环境变量 SMS_CODE_EXPIRE_SECONDS 覆盖 */
const CODE_EXPIRE_SECONDS_DEFAULT = 300

/** 发送间隔默认锁定时间（秒），可用环境变量 SMS_SEND_LOCKOUT_SECONDS 覆盖 */
const SEND_LOCKOUT_SECONDS_DEFAULT = 60

/** 验证码最大尝试次数 */
const MAX_VERIFY_ATTEMPTS = 5

/** Mock 模式固定验证码 */
const MOCK_CODE = '123456'

/**
 * 根据 purpose 解析对应 SMS 模板 CODE
 *
 * 优先级：
 *  1. SMS_TEMPLATE_{PURPOSE}（如 SMS_TEMPLATE_BIND_MOBILE）
 *  2. SMS_TEMPLATE_CODE（向后兼容的全局默认模板）
 */
function resolveTemplateCode(purpose: SmsCodePurpose): string {
  const purposeKey = `SMS_TEMPLATE_${purpose}`
  const purposeTemplate = (process.env[purposeKey] ?? '').trim()
  if (purposeTemplate.length > 0) {
    return purposeTemplate
  }
  // 回退到全局默认模板
  return (process.env.SMS_TEMPLATE_CODE ?? '').trim()
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name)

  constructor(
    @InjectRepository(SmsCode, DATABASE_CONNECTIONS.MAIN)
    private readonly smsCodeRepository: Repository<SmsCode>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(SMS_ADAPTER) private readonly smsAdapter: SmsAdapter,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 验证码过期时间（秒）
   *
   * 读取 SMS_CODE_EXPIRE_SECONDS 环境变量，非法/未配置时回退默认值 300。
   * 运营期可动态调节，无需改代码。
   */
  private get codeExpireSeconds(): number {
    return this.readPositiveInt('SMS_CODE_EXPIRE_SECONDS', CODE_EXPIRE_SECONDS_DEFAULT)
  }

  /**
   * 发送间隔锁定时间（秒）
   *
   * 读取 SMS_SEND_LOCKOUT_SECONDS 环境变量，非法/未配置时回退默认值 60。
   */
  private get sendLockoutSeconds(): number {
    return this.readPositiveInt('SMS_SEND_LOCKOUT_SECONDS', SEND_LOCKOUT_SECONDS_DEFAULT)
  }

  /**
   * 解析正整数环境变量：无效值（空/非数字/≤0/小数截断）一律回退默认值，
   * 避免误配置导致 Redis 写入非法 TTL。
   */
  private readPositiveInt(name: string, fallback: number): number {
    const raw = this.configService.get<string>(name)
    if (raw === undefined || raw === null || raw === '') {
      return fallback
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
  }

  /**
   * 是否为 Mock 模式
   *
   * 直接读取 adapter.isMock 标志，业务代码不再读取 process.env。
   * 控制器用于决定是否回显 mockCode 给客户端。
   */
  isMockMode(): boolean {
    return this.smsAdapter.isMock
  }

  /**
   * 发送短信验证码
   *
   * @param mobile 手机号
   * @param purpose 用途
   * @returns 生成的验证码（Mock 模式下返回固定值）
   */
  async sendCode(mobile: string, purpose: SmsCodePurpose): Promise<string> {
    const lockoutKey = `sms:lockout:${mobile}`
    const codeKey = `sms:code:${mobile}:${purpose}`

    // 1. 检查发送间隔锁（同一手机号 sendLockoutSeconds 内只能发一次）
    const lockoutExists = await this.redis.exists(lockoutKey)
    if (lockoutExists) {
      const ttl = await this.redis.ttl(lockoutKey)
      throw new BusinessException(ErrorCode.RATE_LIMITED, `验证码已发送，请 ${ttl} 秒后重试`, {
        mobile,
        retryAfter: ttl,
      })
    }

    // 2. 生成验证码（Mock 模式固定值，real 模式密码学安全随机）
    const code = this.smsAdapter.isMock ? MOCK_CODE : this.generateRandomCode()

    // 3. 存入 Redis（TTL codeExpireSeconds）
    await this.redis.set(codeKey, code, 'EX', this.codeExpireSeconds)

    // 4. 设置发送间隔锁（TTL sendLockoutSeconds）
    await this.redis.set(lockoutKey, '1', 'EX', this.sendLockoutSeconds)

    // 5. 持久化到数据库（审计记录，含 messageId 用于状态查询）
    const expiredAt = new Date(Date.now() + this.codeExpireSeconds * 1000)
    const smsCode = this.smsCodeRepository.create({
      mobile,
      code,
      purpose,
      expiredAt,
      usedAt: null,
      providerMessageId: null,
    })
    const saved = await this.smsCodeRepository.save(smsCode)

    // 6. 通过显式注入的 adapter 发送短信
    //    - Mock：仅日志输出
    //    - Real：调用阿里云/腾讯云 SMS API
    //    发送失败时业务异常向上抛出，但 Redis 验证码与 DB 记录已写入（用户可凭此校验，
    //    避免短信供应商抖动导致用户完全无法操作；messageId 留空以便后续对账）
    const templateCode = resolveTemplateCode(purpose)
    try {
      const result = await this.smsAdapter.sendSms(mobile, templateCode, { code })

      // 7. 记录 messageId 到 DB（用于后续状态查询）
      if (result.status === 'sent' && result.messageId) {
        await this.smsCodeRepository.update(saved.id, {
          providerMessageId: result.messageId,
        })
      }

      // 日志脱敏：仅打印验证码前两位
      this.logger.log(
        `SMS sent: mobile=${mobile}, purpose=${purpose}, code=${code.slice(0, 2)}***, messageId=${result.messageId}`,
      )
    } catch (err) {
      // 发送失败：记录错误日志（含脱敏验证码），向上抛出业务异常
      // Redis 验证码 + DB 记录保留，便于用户重试与对账
      const reason = err instanceof Error ? err.message : 'unknown'
      this.logger.error(
        `SMS send failed: mobile=${mobile}, purpose=${purpose}, code=${code.slice(0, 2)}***, reason=${reason}`,
      )
      throw err
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

    // 1. 检查尝试次数（防暴力破解，5 次尝试限制）
    const attempts = await this.redis.incr(attemptsKey)
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, this.codeExpireSeconds)
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
}
