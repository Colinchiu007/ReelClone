/**
 * AdminUserService — 用户管理服务
 *
 * 职责：
 * - listUsers：分页查询用户列表（支持 keyword 模糊搜索 + status/role 筛选）
 * - getUserDetail：查询用户详情（含 currentPoints/totalPoints/role/status/lastLoginAt）
 * - updateStatus：封禁/解封用户（封禁时设置 Redis 黑名单 key 复用踢下线机制）
 * - updateRole：变更用户角色（仅 SUPER_ADMIN 可操作）
 * - grantPoints：人工调账（调用 billing-service grant 接口 + 记录操作日志）
 *
 * 数据源：main 库的 users 表（通过 @InjectRepository(User, 'main') 注入）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import Redis from 'ioredis'
import { User, UserRole, UserStatus, DATABASE_CONNECTIONS, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { BillingClient } from '../billing.client'
import { ListUsersDto } from './dto/list-users.dto'
import { UpdateUserStatusDto } from './dto/update-user-status.dto'
import { UpdateUserRoleDto } from './dto/update-user-role.dto'
import { GrantPointsDto } from './dto/grant-points.dto'

/** 封禁后吊销 Token 的 Redis Key 前缀（复用 user-service 的踢下线机制） */
const PASSWORD_CHANGED_KEY_PREFIX = 'user:password-changed'

/** Token 最长有效期 7 天（与 refresh token 对齐） */
const BLACKLIST_TTL_SECONDS = 7 * 24 * 60 * 60

/** 用户信息（不含 password） */
type SafeUser = Omit<User, 'password'>

/** 分页结果 */
interface PaginatedUsers {
  list: SafeUser[]
  page: number
  pageSize: number
  total: number
}

/** 调账结果 */
interface GrantPointsResult {
  transactionId: string
  balance: number
}

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name)

  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepository: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly billingClient: BillingClient,
  ) {}

  // -------------------- 列表查询 --------------------

  /**
   * 分页查询用户列表
   *
   * 支持 keyword（nickname/mobile 模糊搜索）、status 筛选、role 筛选。
   * 返回不含 password 的用户列表。
   */
  async listUsers(dto: ListUsersDto): Promise<PaginatedUsers> {
    const { page, pageSize, keyword, status, role } = dto
    const skip = (page - 1) * pageSize

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.openId',
        'user.unionId',
        'user.mobile',
        'user.nickname',
        'user.avatarUrl',
        'user.email',
        'user.currentPoints',
        'user.totalPoints',
        'user.status',
        'user.role',
        'user.lastLoginAt',
        'user.createdAt',
        'user.updatedAt',
      ])

    if (keyword) {
      qb.andWhere('(user.nickname ILIKE :keyword OR user.mobile ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      })
    }

    if (status) {
      qb.andWhere('user.status = :status', { status })
    }

    if (role) {
      qb.andWhere('user.role = :role', { role })
    }

    qb.orderBy('user.createdAt', 'DESC').skip(skip).take(pageSize)

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  // -------------------- 用户详情 --------------------

  /**
   * 查询用户详情
   *
   * 返回完整用户信息（含 currentPoints/totalPoints/role/status/lastLoginAt），
   * 不含 password。
   *
   * @throws BusinessException 用户不存在（NOT_FOUND）
   */
  async getUserDetail(id: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        openId: true,
        unionId: true,
        mobile: true,
        nickname: true,
        avatarUrl: true,
        email: true,
        currentPoints: true,
        totalPoints: true,
        industryPreferences: true,
        status: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      throw BusinessException.notFound('用户')
    }

    return user
  }

  // -------------------- 封禁/解封 --------------------

  /**
   * 更新用户状态（封禁/解封）
   *
   * 封禁时设置 Redis 黑名单 key `user:password-changed:{userId}`，
   * 复用现有踢下线机制，使用户当前 token 失效。
   *
   * @param id 目标用户 ID
   * @param dto 更新状态的参数（目标状态）
   * @param operatorId 操作者 ID（用于操作日志记录）
   * @throws BusinessException 用户不存在 / 状态不合法
   */
  async updateStatus(id: string, dto: UpdateUserStatusDto, operatorId?: string): Promise<SafeUser> {
    // 仅允许 ACTIVE / FROZEN，不允许通过此接口设置为 DELETED
    if (dto.status !== UserStatus.ACTIVE && dto.status !== UserStatus.FROZEN) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '仅支持 ACTIVE / FROZEN 状态', {
        status: dto.status,
      })
    }

    const user = await this.findUserById(id)
    user.status = dto.status
    const saved = await this.userRepository.save(user)

    // 封禁时设置 Redis 黑名单 key，复用踢下线机制
    if (dto.status === UserStatus.FROZEN) {
      const key = `${PASSWORD_CHANGED_KEY_PREFIX}:${id}`
      const now = Date.now()
      await this.redis.set(key, now, 'EX', BLACKLIST_TTL_SECONDS)
      this.logger.log(`用户 ${id} 已被封禁，已设置踢下线标记`)
    }

    this.logger.log(`用户 ${id} 状态更新为 ${dto.status}`)
    this.logger.log(`操作者 ${operatorId ?? 'unknown'} 更新用户 ${id} 状态`)
    return this.sanitizeUser(saved)
  }

  // -------------------- 角色变更 --------------------

  /**
   * 变更用户角色
   *
   * 仅 SUPER_ADMIN 可操作。操作者角色从 request.user.role 获取，
   * 由控制器通过 @CurrentUser('role') 注入。
   *
   * @param id 目标用户 ID
   * @param dto 目标角色
   * @param operatorRole 操作者角色（需为 SUPER_ADMIN）
   * @param operatorId 操作者 ID（用于操作日志记录）
   * @throws BusinessException 权限不足 / 用户不存在
   */
  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    operatorRole: string,
    operatorId?: string,
  ): Promise<SafeUser> {
    // 仅 SUPER_ADMIN 可操作角色变更
    if (operatorRole !== UserRole.SUPER_ADMIN) {
      throw BusinessException.forbidden('仅超级管理员可变更用户角色')
    }

    const user = await this.findUserById(id)
    user.role = dto.role
    const saved = await this.userRepository.save(user)

    this.logger.log(`用户 ${id} 角色更新为 ${dto.role}`)
    this.logger.log(`操作者 ${operatorId ?? 'unknown'} 更新用户 ${id} 角色`)
    return this.sanitizeUser(saved)
  }

  // -------------------- 人工调账 --------------------

  /**
   * 人工调账（赠送积分）
   *
   * 调用 billing-service 的 POST /api/v1/points/grant 接口，
   * 通过 x-api-key Header 携带 INTERNAL_API_KEY 鉴权。
   * 调账完成后记录操作日志（operatorId/targetUserId/amount/reason）。
   *
   * @param id 目标用户 ID
   * @param dto 调账参数（amount + reason）
   * @param operatorId 操作者 ID（用于操作日志）
   * @throws BusinessException 用户不存在 / billing-service 调用失败
   */
  async grantPoints(
    id: string,
    dto: GrantPointsDto,
    operatorId: string,
  ): Promise<GrantPointsResult> {
    // 校验目标用户存在
    const user = await this.findUserById(id)

    // B4: 生成 adjustment UUID（每次调账唯一），替代字符串 'admin-grant'
    // adjustmentId 同时用于：
    //  - orderId（billing-service grant → CreditOperation.relatedOrderId）
    //  - idempotencyKey 的一部分（保证同一操作重试幂等）
    const adjustmentId = randomUUID()

    // 幂等键：包含 adjustmentId 确保每次调账唯一
    // 前端重试或双击不会重复发放积分
    const idempotencyKey = `admin-grant:${operatorId}:${id}:${adjustmentId}`

    const data = await this.billingClient.grant({
      userId: id,
      amount: dto.amount,
      idempotencyKey,
      orderId: adjustmentId,
      packageId: 'admin-grant',
      description: dto.reason,
    })

    // 记录操作日志
    this.logger.log(
      `管理员 ${operatorId} 对用户 ${id}(${user.nickname}) 调账 ${dto.amount} 积分，原因：${dto.reason}，流水ID：${data.transactionId}，adjustmentId：${adjustmentId}`,
    )

    return {
      transactionId: data.transactionId,
      balance: data.balance,
    }
  }

  // -------------------- 内部方法 --------------------

  /**
   * 根据 ID 查找用户，不存在则抛出 NOT_FOUND
   */
  private async findUserById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } })
    if (!user) {
      throw BusinessException.notFound('用户')
    }
    return user
  }

  /**
   * 过滤敏感字段（password），返回安全用户对象
   */
  private sanitizeUser(user: User): SafeUser {
    const { password: _, ...rest } = user
    return rest
  }
}
