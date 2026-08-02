/**
 * 用户服务
 *
 * 职责：
 * - 获取当前用户信息（过滤 password 字段）
 * - 更新用户信息
 * - 绑定手机号（校验验证码 → 更新 mobile）
 * - 修改密码（旧密码模式 / 短信验证码模式）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as bcrypt from 'bcrypt'
import Redis from 'ioredis'
import {
  User,
  UserStatus,
  SmsCodePurpose,
  Template,
  TemplateStatus,
  DATABASE_CONNECTIONS,
  REDIS_CLIENT,
} from '@reelclone/database'
import { BusinessException, ErrorCode, buildTokenVersionKey } from '@reelclone/common'
import { UpdateUserDto } from './dto/update-user.dto'
import { BindMobileDto } from './dto/bind-mobile.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { SmsService } from './sms.service'

/** bcrypt 加密轮次 */
const BCRYPT_ROUNDS = 10

/** 修改密码后吊销 Token 的 Redis Key 前缀 */
const PASSWORD_CHANGED_KEY_PREFIX = 'user:password-changed'

/** Token Version 缓存 TTL：30 天（覆盖 token 最长生命周期 + 缓冲） */
const TOKEN_VERSION_CACHE_TTL = 30 * 24 * 60 * 60

/**
 * 公开用户主页信息
 *
 * 用于模板广场展示上传者信息，仅暴露非敏感字段 + 模板统计。
 */
export interface PublicUserProfile {
  /** 用户 ID */
  userId: string
  /** 昵称 */
  nickname: string
  /** 头像 URL（可能为 null） */
  avatarUrl: string | null
  /** 用户上传模板数（status 为 ACTIVE / ANALYZING） */
  templateUploadCount: number
  /** 用户已上线模板累计被使用次数（status 为 ACTIVE） */
  templateUsedCount: number
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepository: Repository<User>,
    // template 库的 Template 仓储（用于公开主页聚合查询模板统计）
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepository: Repository<Template>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly smsService: SmsService,
  ) {}

  /**
   * 获取当前用户完整信息（不含 password）
   */
  async getCurrentUser(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.findUserById(userId)
    return this.sanitizeUser(user)
  }

  /**
   * 获取公开用户主页信息
   *
   * 用于模板广场展示上传者信息，包含：
   * - 用户基本信息（id/nickname/avatarUrl，来自 main 库）
   * - 模板上传数（template 库聚合：status IN ACTIVE/ANALYZING 的模板数量）
   * - 模板被使用次数（template 库聚合：status = ACTIVE 的 use_count 总和）
   *
   * @param userId 用户 ID
   * @throws BusinessException 用户不存在时抛出 NOT_FOUND
   */
  async findPublicProfile(userId: string): Promise<PublicUserProfile> {
    // 1. 从 main 库查询用户基本信息（仅取公开字段）
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'nickname', 'avatarUrl'],
    })

    if (!user) {
      throw BusinessException.notFound('用户')
    }

    // 2. 从 template 库聚合查询模板上传数
    //    COUNT(*) WHERE user_id = ? AND status IN ('ACTIVE', 'ANALYZING')
    const uploadRow = await this.templateRepository
      .createQueryBuilder('t')
      .select('COUNT(*)', 'count')
      .where('t.userId = :userId', { userId })
      .andWhere('t.status IN (:...statuses)', {
        statuses: [TemplateStatus.ACTIVE, TemplateStatus.ANALYZING],
      })
      .getRawOne()

    // 3. 从 template 库聚合查询模板被使用次数
    //    SUM(use_count) WHERE user_id = ? AND status = 'ACTIVE'
    const usedRow = await this.templateRepository
      .createQueryBuilder('t')
      .select('SUM(t.useCount)', 'sum')
      .where('t.userId = :userId', { userId })
      .andWhere('t.status = :status', { status: TemplateStatus.ACTIVE })
      .getRawOne()

    // Postgres 聚合结果以字符串返回，SUM 无数据时返回 null，统一转换为 number
    const templateUploadCount = Number(uploadRow?.count ?? 0)
    const templateUsedCount = Number(usedRow?.sum ?? 0)

    return {
      userId: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      templateUploadCount,
      templateUsedCount,
    }
  }

  /**
   * 更新用户信息
   */
  async updateUser(userId: string, dto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const user = await this.findUserById(userId)

    // 按需更新字段
    if (dto.nickname !== undefined) {
      user.nickname = dto.nickname
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl
    }
    if (dto.email !== undefined) {
      user.email = dto.email
    }
    if (dto.industryPreferences !== undefined) {
      user.industryPreferences = dto.industryPreferences
    }

    const saved = await this.userRepository.save(user)
    this.logger.log(`User ${userId} updated profile`)
    return this.sanitizeUser(saved)
  }

  /**
   * 绑定手机号
   *
   * 流程：
   * 1. 校验验证码（SmsService.verifyCode）
   * 2. 检查手机号是否已被其他用户绑定
   * 3. 更新 user.mobile
   *
   * @throws BusinessException 验证码错误 / 手机号已被绑定 / 用户已绑定手机号
   */
  async bindMobile(userId: string, dto: BindMobileDto): Promise<Omit<User, 'password'>> {
    const user = await this.findUserById(userId)

    // 用户已绑定手机号
    if (user.mobile) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        '您已绑定手机号，如需更换请联系客服',
        { currentMobile: user.mobile },
      )
    }

    // 校验验证码
    await this.smsService.verifyCode(dto.mobile, SmsCodePurpose.BIND_MOBILE, dto.code)

    // 检查手机号是否已被其他用户绑定
    const existingUser = await this.userRepository.findOne({
      where: { mobile: dto.mobile },
      select: ['id'],
    })
    if (existingUser && existingUser.id !== userId) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '该手机号已被其他账号绑定', {
        mobile: dto.mobile,
      })
    }

    // 更新手机号
    user.mobile = dto.mobile
    const saved = await this.userRepository.save(user)
    this.logger.log(`User ${userId} bound mobile ${dto.mobile}`)
    return this.sanitizeUser(saved)
  }

  /**
   * 修改密码
   *
   * 逻辑：
   * - 如果用户已设置密码（user.password 不为 null），用 oldPassword 验证
   * - 否则用短信验证码验证（code + mobile）
   *
   * 修改成功后，将 userId 写入 Redis 触发其他服务校验现有 Token
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: boolean }> {
    const user = await this.findUserById(userId)

    if (user.password) {
      // ---- 旧密码模式 ----
      if (!dto.oldPassword) {
        throw new BusinessException(ErrorCode.VALIDATION_ERROR, '请输入旧密码', {
          field: 'oldPassword',
        })
      }

      const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.password)
      if (!isOldPasswordValid) {
        throw new BusinessException(ErrorCode.VALIDATION_ERROR, '旧密码不正确', {
          field: 'oldPassword',
        })
      }
    } else {
      // ---- 短信验证码模式 ----
      if (!dto.code || !dto.mobile) {
        throw new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          '首次设置密码需通过短信验证码验证，请提供 mobile 和 code',
          { required: ['mobile', 'code'] },
        )
      }

      // 校验验证码（用途为 RESET_PASSWORD）
      await this.smsService.verifyCode(dto.mobile, SmsCodePurpose.RESET_PASSWORD, dto.code)
    }

    // 哈希新密码并保存
    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
    user.password = hashedPassword
    await this.userRepository.save(user)

    // 递增 tokenVersion（使所有已签发的 JWT 失效）
    user.tokenVersion = (user.tokenVersion ?? 0) + 1
    await this.userRepository.save(user)

    // 缓存新版本号到 Redis（供其他服务快速校验）
    const tvKey = buildTokenVersionKey(userId)
    await this.redis.set(tvKey, String(user.tokenVersion), 'EX', TOKEN_VERSION_CACHE_TTL)

    // 吊销所有现有 Token：将 userId 写入 Redis
    await this.revokeAllTokens(userId)

    this.logger.log(`User ${userId} changed password`)
    return { success: true }
  }

  /**
   * 递增用户 tokenVersion（凭证变更撤权）
   *
   * 在以下场景调用：
   * - 管理员冻结/注销账号
   * - 安全事件强制下线
   */
  async incrementTokenVersion(userId: string): Promise<number> {
    const user = await this.findUserById(userId)
    user.tokenVersion = (user.tokenVersion ?? 0) + 1
    await this.userRepository.save(user)

    const tvKey = buildTokenVersionKey(userId)
    await this.redis.set(tvKey, String(user.tokenVersion), 'EX', TOKEN_VERSION_CACHE_TTL)

    this.logger.log(`User ${userId} tokenVersion incremented to ${user.tokenVersion}`)
    return user.tokenVersion
  }

  /**
   * 吊销用户所有现有 Token
   * 在 Redis 中写入标记，其他服务可通过检查此标记使现有 Token 失效
   */
  private async revokeAllTokens(userId: string): Promise<void> {
    const key = `${PASSWORD_CHANGED_KEY_PREFIX}:${userId}`
    const now = Date.now()
    // Token 最长有效期 7 天（与 refresh token 对齐），过期后自动清理
    await this.redis.set(key, now, 'EX', 7 * 24 * 60 * 60)
  }

  /**
   * 根据 ID 查找用户，不存在则抛出 404
   */
  private async findUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    })

    if (!user) {
      throw BusinessException.notFound('用户')
    }

    if (user.status === UserStatus.FROZEN) {
      throw BusinessException.forbidden('账号已被冻结')
    }

    return user
  }

  /**
   * 过滤敏感字段（password），返回安全用户对象
   */
  private sanitizeUser(user: User): Omit<User, 'password'> {
    const { password: _, ...rest } = user
    return rest
  }
}
