/**
 * AdminUserService 单元测试
 *
 * 测试范围：
 * - listUsers：分页 / keyword 模糊搜索 / status+role 筛选
 * - getUserDetail：正常返回 / 用户不存在
 * - updateStatus：封禁（设置 Redis 黑名单）/ 解封 / 非法状态 / 用户不存在
 * - updateRole：SUPER_ADMIN 成功 / 非 SUPER_ADMIN 拒绝 / 用户不存在
 * - grantPoints：成功调账 / 用户不存在 / billing 返回错误 / 网络错误
 */
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import Redis from 'ioredis'
import { AdminUserService } from './admin-user.service'
import { BillingClient } from '../billing.client'
import { ListUsersDto } from './dto/list-users.dto'
import { UpdateUserStatusDto } from './dto/update-user-status.dto'
import { UpdateUserRoleDto } from './dto/update-user-role.dto'
import { GrantPointsDto } from './dto/grant-points.dto'
import { User, UserRole, UserStatus, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'

// -------------------- Mock 工厂 --------------------

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    openId: 'openid-1',
    unionId: null,
    mobile: '13800138000',
    password: 'hashed_password',
    nickname: 'TestUser',
    avatarUrl: null,
    email: null,
    currentPoints: 100,
    totalPoints: 500,
    industryPreferences: [],
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    lastLoginAt: new Date('2024-06-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    assets: [],
    works: [],
    avatarGroups: [],
    orders: [],
    userPackages: [],
    notifications: [],
    benchmarks: [],
    pointTransactions: [],
    favorites: [],
    ...overrides,
  } as User
}

function createRedisMock(): jest.Mocked<Redis> {
  return {
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
    del: jest.fn(async () => 1),
    exists: jest.fn(async () => 0),
  } as unknown as jest.Mocked<Redis>
}

/** 构造 QueryBuilder 链式 Mock */
function createQueryBuilderMock() {
  return {
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  }
}

// -------------------- 测试 --------------------

describe('AdminUserService', () => {
  let service: AdminUserService
  let userRepo: jest.Mocked<Repository<User>>
  let redis: jest.Mocked<Redis>
  let billingClient: jest.Mocked<BillingClient>

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>

    redis = createRedisMock()

    billingClient = {
      grant: jest.fn(),
      deduct: jest.fn(),
      reconcile: jest.fn(),
    } as unknown as jest.Mocked<BillingClient>

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserService,
        { provide: getRepositoryToken(User, 'main'), useValue: userRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: BillingClient, useValue: billingClient },
      ],
    }).compile()

    service = module.get<AdminUserService>(AdminUserService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- listUsers --------------------

  describe('listUsers', () => {
    it('应返回分页用户列表', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[createUser()], 1])
      ;(userRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new ListUsersDto()
      const result = await service.listUsers(dto)

      expect(result.list).toHaveLength(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(1)
      expect(qb.getManyAndCount).toHaveBeenCalled()
    })

    it('应支持 keyword 模糊搜索（nickname / mobile）', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(userRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new ListUsersDto()
      dto.keyword = '测试'
      await service.listUsers(dto)

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(user.nickname ILIKE :keyword OR user.mobile ILIKE :keyword)',
        { keyword: '%测试%' },
      )
    })

    it('应支持 status / role 筛选', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(userRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new ListUsersDto()
      dto.status = UserStatus.FROZEN
      dto.role = UserRole.ADMIN
      await service.listUsers(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('user.status = :status', {
        status: UserStatus.FROZEN,
      })
      expect(qb.andWhere).toHaveBeenCalledWith('user.role = :role', {
        role: UserRole.ADMIN,
      })
    })

    it('应正确计算分页偏移量', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(userRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new ListUsersDto()
      dto.page = 3
      dto.pageSize = 10
      await service.listUsers(dto)

      expect(qb.skip).toHaveBeenCalledWith(20)
      expect(qb.take).toHaveBeenCalledWith(10)
    })
  })

  // -------------------- getUserDetail --------------------

  describe('getUserDetail', () => {
    it('应返回用户详情（含 currentPoints/totalPoints/role/status/lastLoginAt，不含 password）', async () => {
      const user = createUser({
        currentPoints: 200,
        totalPoints: 1000,
      })
      // 模拟 TypeORM select 行为（排除 password 字段）
      delete (user as any).password
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)

      const result = await service.getUserDetail('user-1')

      expect(result.id).toBe('user-1')
      expect(result.nickname).toBe('TestUser')
      expect(result.currentPoints).toBe(200)
      expect(result.totalPoints).toBe(1000)
      expect(result.role).toBe(UserRole.USER)
      expect(result.status).toBe(UserStatus.ACTIVE)
      expect(result.lastLoginAt).toEqual(new Date('2024-06-01'))
      expect(result).not.toHaveProperty('password')
    })

    it('用户不存在时应抛出 NOT_FOUND', async () => {
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(null)

      await expect(service.getUserDetail('nonexistent')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- updateStatus --------------------

  describe('updateStatus', () => {
    it('封禁用户时应更新状态并设置 Redis 黑名单 key', async () => {
      const user = createUser({ status: UserStatus.ACTIVE })
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)
      ;(userRepo.save as jest.Mock).mockImplementation(async (u: User) => u)

      const dto: UpdateUserStatusDto = { status: UserStatus.FROZEN }
      const result = await service.updateStatus('user-1', dto)

      expect(result.status).toBe(UserStatus.FROZEN)
      expect(redis.set).toHaveBeenCalledWith(
        'user:password-changed:user-1',
        expect.any(Number),
        'EX',
        7 * 24 * 60 * 60,
      )
    })

    it('解封用户时不应设置 Redis 黑名单 key', async () => {
      const user = createUser({ status: UserStatus.FROZEN })
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)
      ;(userRepo.save as jest.Mock).mockImplementation(async (u: User) => u)

      const dto: UpdateUserStatusDto = { status: UserStatus.ACTIVE }
      const result = await service.updateStatus('user-1', dto)

      expect(result.status).toBe(UserStatus.ACTIVE)
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('不允许设置为 DELETED 状态', async () => {
      const dto = { status: UserStatus.DELETED } as UpdateUserStatusDto

      await expect(service.updateStatus('user-1', dto)).rejects.toThrow(BusinessException)
      expect(userRepo.findOne).not.toHaveBeenCalled()
    })

    it('用户不存在时应抛出 NOT_FOUND', async () => {
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(null)

      const dto: UpdateUserStatusDto = { status: UserStatus.FROZEN }
      await expect(service.updateStatus('nonexistent', dto)).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- updateRole --------------------

  describe('updateRole', () => {
    it('SUPER_ADMIN 操作时应成功变更角色', async () => {
      const user = createUser({ role: UserRole.USER })
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)
      ;(userRepo.save as jest.Mock).mockImplementation(async (u: User) => u)

      const dto: UpdateUserRoleDto = { role: UserRole.ADMIN }
      const result = await service.updateRole('user-1', dto, 'SUPER_ADMIN')

      expect(result.role).toBe(UserRole.ADMIN)
    })

    it('非 SUPER_ADMIN 操作时应抛出 FORBIDDEN', async () => {
      const dto: UpdateUserRoleDto = { role: UserRole.ADMIN }

      await expect(service.updateRole('user-1', dto, 'ADMIN')).rejects.toThrow(BusinessException)
      expect(userRepo.findOne).not.toHaveBeenCalled()
    })

    it('用户不存在时应抛出 NOT_FOUND', async () => {
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(null)

      const dto: UpdateUserRoleDto = { role: UserRole.ADMIN }
      await expect(service.updateRole('nonexistent', dto, 'SUPER_ADMIN')).rejects.toThrow(
        BusinessException,
      )
    })
  })

  // -------------------- grantPoints --------------------

  describe('grantPoints', () => {
    it('应调用 billing-service grant 接口并返回调账结果', async () => {
      const user = createUser()
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)

      billingClient.grant.mockResolvedValue({
        success: true,
        balance: 200,
        transactionId: 'tx-001',
      })

      const dto: GrantPointsDto = { amount: 100, reason: '客诉补偿' }
      const result = await service.grantPoints('user-1', dto, 'admin-1')

      expect(billingClient.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: 100,
          description: '客诉补偿',
          // B4: idempotencyKey 现在包含 adjustment UUID（每次调账唯一）
          idempotencyKey: expect.stringMatching(/^admin-grant:admin-1:user-1:[0-9a-f-]{36}$/),
          // B4: orderId 现在是 adjustment UUID（不再是字符串 'admin-grant'）
          orderId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          packageId: 'admin-grant',
        }),
      )
      expect(result.transactionId).toBe('tx-001')
      expect(result.balance).toBe(200)
    })

    it('用户不存在时应抛出 NOT_FOUND', async () => {
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(null)

      const dto: GrantPointsDto = { amount: 100, reason: '补偿' }
      await expect(service.grantPoints('nonexistent', dto, 'admin-1')).rejects.toThrow(
        BusinessException,
      )
    })

    it('billing-service 返回错误码时应抛出 BusinessException', async () => {
      const user = createUser()
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)

      billingClient.grant.mockRejectedValue(
        new BusinessException(ErrorCode.INTERNAL_ERROR, 'billing 内部错误'),
      )

      const dto: GrantPointsDto = { amount: 100, reason: '补偿' }
      await expect(service.grantPoints('user-1', dto, 'admin-1')).rejects.toThrow(BusinessException)
    })

    it('网络错误时应抛出 INTERNAL_ERROR', async () => {
      const user = createUser()
      ;(userRepo.findOne as jest.Mock).mockResolvedValue(user)

      billingClient.grant.mockRejectedValue(
        new BusinessException(ErrorCode.INTERNAL_ERROR, '服务暂时不可用，请稍后重试'),
      )

      const dto: GrantPointsDto = { amount: 100, reason: '补偿' }
      await expect(service.grantPoints('user-1', dto, 'admin-1')).rejects.toThrow(BusinessException)
    })
  })
})
