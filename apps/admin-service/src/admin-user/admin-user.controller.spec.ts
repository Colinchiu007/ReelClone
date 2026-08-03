/**
 * AdminUserController 单元测试
 *
 * 测试覆盖：
 *  - GET    /admin/users              listUsers：转发 dto 给 service
 *  - GET    /admin/users/:id          getUserDetail：转发 id
 *  - PUT    /admin/users/:id/status   updateStatus：转发 id + dto
 *  - PUT    /admin/users/:id/role     updateRole：转发 id + dto + operatorRole
 *  - POST   /admin/users/:id/grant-points  grantPoints：转发 id + dto + operatorId
 */
import { Test, TestingModule } from '@nestjs/testing'
import { AdminUserController } from './admin-user.controller'
import { AdminUserService } from './admin-user.service'
import { ListUsersDto } from './dto/list-users.dto'
import { UpdateUserStatusDto } from './dto/update-user-status.dto'
import { UpdateUserRoleDto } from './dto/update-user-role.dto'
import { GrantPointsDto } from './dto/grant-points.dto'
import { UserRole, UserStatus } from '@reelclone/database'

describe('AdminUserController', () => {
  let controller: AdminUserController
  let service: jest.Mocked<AdminUserService>

  beforeEach(async () => {
    service = {
      listUsers: jest.fn(),
      getUserDetail: jest.fn(),
      updateStatus: jest.fn(),
      updateRole: jest.fn(),
      grantPoints: jest.fn(),
    } as unknown as jest.Mocked<AdminUserService>

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUserController],
      providers: [{ provide: AdminUserService, useValue: service }],
    }).compile()

    controller = module.get<AdminUserController>(AdminUserController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- GET /admin/users --------------------

  describe('listUsers', () => {
    it('应调用 service.listUsers 并返回分页结果', async () => {
      const dto = new ListUsersDto()
      const mockResult = {
        list: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }
      service.listUsers.mockResolvedValue(mockResult)

      const result = await controller.listUsers(dto)

      expect(service.listUsers).toHaveBeenCalledWith(dto)
      expect(result).toEqual(mockResult)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
    })
  })

  // -------------------- GET /admin/users/:id --------------------

  describe('getUserDetail', () => {
    it('应调用 service.getUserDetail 并返回用户详情', async () => {
      const mockUser = {
        id: 'user-1',
        nickname: 'TestUser',
        currentPoints: 100,
        totalPoints: 500,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      }
      service.getUserDetail.mockResolvedValue(mockUser as never)

      const result = await controller.getUserDetail('user-1')

      expect(service.getUserDetail).toHaveBeenCalledWith('user-1')
      expect(result).toBe(mockUser)
    })
  })

  // -------------------- PUT /admin/users/:id/status --------------------

  describe('updateStatus', () => {
    it('应调用 service.updateStatus 并传入 id 和 dto', async () => {
      const dto: UpdateUserStatusDto = { status: UserStatus.FROZEN }
      const mockResult = { id: 'user-1', status: UserStatus.FROZEN }
      service.updateStatus.mockResolvedValue(mockResult as never)

      const result = await controller.updateStatus('user-1', dto, 'admin-001')

      expect(service.updateStatus).toHaveBeenCalledWith('user-1', dto, 'admin-001')
      expect(result).toBe(mockResult)
    })
  })

  // -------------------- PUT /admin/users/:id/role --------------------

  describe('updateRole', () => {
    it('应调用 service.updateRole 并传入 id、dto 和 operatorRole', async () => {
      const dto: UpdateUserRoleDto = { role: UserRole.ADMIN }
      const mockResult = { id: 'user-1', role: UserRole.ADMIN }
      service.updateRole.mockResolvedValue(mockResult as never)

      const result = await controller.updateRole('user-1', dto, 'SUPER_ADMIN', 'admin-001')

      expect(service.updateRole).toHaveBeenCalledWith('user-1', dto, 'SUPER_ADMIN', 'admin-001')
      expect(result).toBe(mockResult)
    })
  })

  // -------------------- POST /admin/users/:id/grant-points --------------------

  describe('grantPoints', () => {
    it('应调用 service.grantPoints 并传入 id、dto 和 operatorId', async () => {
      const dto: GrantPointsDto = { amount: 100, reason: '客诉补偿' }
      const mockResult = { transactionId: 'tx-001', balance: 200 }
      service.grantPoints.mockResolvedValue(mockResult)

      const result = await controller.grantPoints('user-1', dto, 'admin-1')

      expect(service.grantPoints).toHaveBeenCalledWith('user-1', dto, 'admin-1')
      expect(result).toEqual(mockResult)
    })
  })
})
