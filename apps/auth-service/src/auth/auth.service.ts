/**
 * 认证业务服务
 *
 * 三大核心流程：
 *  1. wxLogin        微信小程序登录（code2session → 查找/创建用户 → 签发 JWT）
 *  2. refreshToken   用 Refresh Token 换发新的 Token 对
 *  3. logout         将当前 Token 的 jti 加入 Redis 黑名单（剩余 TTL 内有效）
 */
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as bcrypt from 'bcrypt'
import type { Redis } from 'ioredis'
import { User, UserStatus, UserRole, REDIS_CLIENT, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BusinessException, ErrorCode, type CurrentUserPayload } from '@reelclone/common'
import { WechatService } from './wechat.service'
import { JwtCustomService, type JwtPayload } from './jwt.service'
import { buildBlacklistKey } from './jwt.strategy'
import type { WechatLoginDto } from './dto/wechat-login.dto'
import type { AdminLoginDto } from './dto/admin-login.dto'

/** 登录响应中暴露的用户信息（脱敏） */
export interface AuthUserResponse {
  id: string
  openId: string
  unionId: string | null
  nickname: string
  avatarUrl: string | null
  mobile: string | null
  status: UserStatus
  currentPoints: number
  totalPoints: number
}

/** 微信登录响应 */
export interface WxLoginResult {
  accessToken: string
  refreshToken: string
  user: AuthUserResponse
  isNewUser: boolean
}

/** Token 刷新响应 */
export interface RefreshTokenResult {
  accessToken: string
  refreshToken: string
}

/** 管理员登录响应 */
export interface AdminLoginResult {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    nickname: string
    role: UserRole
  }
}

/** 单位：秒 */
const SECONDS_PER_MS = 1000

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
    private readonly wechatService: WechatService,
    private readonly jwtService: JwtCustomService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 读取新用户赠送积分配置（默认 0，E2E 环境配置 100）
   */
  private getNewUserBonusPoints(): number {
    const raw = this.configService.get<string>('NEW_USER_BONUS_POINTS')
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  /**
   * 微信小程序登录
   *
   * 流程：
   *  1. 调用 code2session 获取 openid（+可选 unionid）
   *  2. 根据 openid 查找用户
   *     - 不存在 → 创建新用户（默认 ACTIVE 状态，0 积分）
   *     - 已存在 → 更新 lastLoginAt + 可选的 nickname/avatarUrl/unionId
   *  3. 校验用户状态（FROZEN/DELETED 拒绝登录）
   *  4. 签发 Access + Refresh Token
   */
  async wxLogin(dto: WechatLoginDto): Promise<WxLoginResult> {
    // 1. 调用微信 code2session
    const session = await this.wechatService.code2session(dto.code)

    // 2. 查找或创建用户
    let user = await this.userRepo.findOne({
      where: { openId: session.openid },
    })
    let isNewUser = false

    if (!user) {
      // 新用户：读取赠送积分配置（E2E 环境配置 100，生产环境可配置为 0 或正值）
      const bonusPoints = this.getNewUserBonusPoints()
      user = this.userRepo.create({
        openId: session.openid,
        unionId: session.unionid ?? null,
        nickname: dto.nickname?.trim() || `用户${session.openid.slice(-6)}`,
        avatarUrl: dto.avatarUrl ?? null,
        status: UserStatus.ACTIVE,
        currentPoints: bonusPoints,
        totalPoints: bonusPoints,
        industryPreferences: [],
        lastLoginAt: new Date(),
      })
      user = await this.userRepo.save(user)
      isNewUser = true
      this.logger.log(
        `New user registered: userId=${user.id} openId=${user.openId} bonusPoints=${bonusPoints}`,
      )
    } else {
      // 老用户：更新登录时间 + 可选字段
      user.lastLoginAt = new Date()
      if (dto.nickname && dto.nickname.trim()) {
        user.nickname = dto.nickname.trim()
      }
      if (dto.avatarUrl) {
        user.avatarUrl = dto.avatarUrl
      }
      if (session.unionid) {
        user.unionId = session.unionid
      }
      user = await this.userRepo.save(user)
      this.logger.log(`Existing user login: userId=${user.id}`)
    }

    // 3. 校验用户状态
    if (user.status !== UserStatus.ACTIVE) {
      throw new BusinessException(ErrorCode.FORBIDDEN, `账号当前状态（${user.status}）不允许登录`, {
        status: user.status,
      })
    }

    // 4. 签发 JWT（payload 携带 role，供 RolesGuard 校验权限）
    const tokens = this.jwtService.signTokenPair(user.id, user.openId, user.role)

    return {
      ...tokens,
      user: this.toAuthUserResponse(user),
      isNewUser,
    }
  }

  /**
   * 管理员登录（手机号 + 密码）
   *
   * 流程：
   *  1. 通过 mobile 查找用户
   *  2. 校验用户存在 / 已设置密码 / 角色为管理员 / 状态为 ACTIVE
   *  3. bcrypt.compare 验证密码
   *  4. 更新 lastLoginAt
   *  5. 签发 Access + Refresh Token
   */
  async adminLogin(dto: AdminLoginDto): Promise<AdminLoginResult> {
    // 1. 通过 mobile 查找用户
    const user = await this.userRepo.findOne({
      where: { mobile: dto.mobile },
    })

    // 2. 用户不存在 / 未设置密码 → 统一返回"账号或密码错误"（避免信息泄露）
    if (!user || !user.password) {
      throw new UnauthorizedException('账号或密码错误')
    }

    // 3. 角色校验：仅 ADMIN / SUPER_ADMIN 允许通过此端点登录
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('需要管理员权限')
    }

    // 4. 状态校验：非 ACTIVE 拒绝登录
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('账号已被冻结')
    }

    // 5. 密码校验
    const isPasswordValid = await bcrypt.compare(dto.password, user.password)
    if (!isPasswordValid) {
      throw new UnauthorizedException('账号或密码错误')
    }

    // 6. 更新登录时间
    user.lastLoginAt = new Date()
    await this.userRepo.save(user)

    // 7. 签发 JWT
    const tokens = this.jwtService.signTokenPair(user.id, user.openId, user.role)

    this.logger.log(`Admin login: userId=${user.id} mobile=${dto.mobile}`)

    return {
      ...tokens,
      user: {
        id: user.id,
        nickname: user.nickname,
        role: user.role,
      },
    }
  }

  /**
   * 刷新 Token
   *
   * 流程：
   *  1. 验证 Refresh Token 签名 & 过期
   *  2. 检查 jti 是否已加入黑名单
   *  3. 签发新的 Token 对（旧 Refresh Token 不主动失效，由客户端丢弃）
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResult> {
    let payload: JwtPayload
    try {
      payload = this.jwtService.verify(refreshToken)
    } catch {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        'Refresh Token 无效或已过期，请重新登录',
        undefined,
      )
    }

    // 检查黑名单
    if (payload.jti) {
      const isBlacklisted = await this.redis.exists(buildBlacklistKey(payload.jti))
      if (isBlacklisted) {
        throw new BusinessException(ErrorCode.UNAUTHORIZED, '登录已失效，请重新登录', undefined)
      }
    }

    // 签发新 Token 对（沿用原 payload 中的 role；兼容旧 Token 缺失 role 时回落 USER）
    const role = payload.role ?? UserRole.USER
    return this.jwtService.signTokenPair(payload.sub, payload.openId, role)
  }

  /**
   * 登出
   *
   * 将当前 Access Token 的 jti 加入 Redis 黑名单，TTL = token 剩余有效期
   * 此后该 Token 再次被使用时，JwtStrategy.validate 会检测到黑名单拒绝访问
   *
   * @param user 当前登录用户（由 @CurrentUser 注入，包含 jti/exp）
   */
  async logout(user: CurrentUserPayload): Promise<void> {
    const jti = user.jti as string | undefined
    const exp = user.exp as number | undefined

    if (!jti) {
      // 没有 jti 的 Token 无法加入黑名单，直接返回成功（幂等）
      this.logger.warn(`Logout called without jti: userId=${user.userId ?? 'unknown'}`)
      return
    }

    // 计算 TTL：当前 Token 剩余有效期
    const nowSec = Math.floor(Date.now() / SECONDS_PER_MS)
    const ttl = exp ? exp - nowSec : 0

    if (ttl > 0) {
      // EX 选项：秒级过期
      await this.redis.set(buildBlacklistKey(jti), '1', 'EX', ttl)
      this.logger.log(`User logout: userId=${user.userId} jti=${jti} ttl=${ttl}s`)
    } else {
      // 已过期的 Token 无需加入黑名单
      this.logger.log(`Logout called with already-expired token: userId=${user.userId}`)
    }
  }

  /** 将 User 实体转为对外暴露的脱敏结构 */
  private toAuthUserResponse(user: User): AuthUserResponse {
    return {
      id: user.id,
      openId: user.openId,
      unionId: user.unionId,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      mobile: user.mobile,
      status: user.status,
      currentPoints: user.currentPoints,
      totalPoints: user.totalPoints,
    }
  }
}
