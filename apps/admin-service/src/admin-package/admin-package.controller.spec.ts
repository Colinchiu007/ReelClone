/**
 * AdminPackageController 单元测试
 *
 * 测试覆盖:
 *  - 各端点调用正确的服务方法并返回结果
 *  - Controller 级别 @Roles('ADMIN', 'SUPER_ADMIN') 元数据校验
 */
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '@reelclone/common'
import { Package, PackageStatus, PackageType } from '@reelclone/database'
import { AdminPackageController } from './admin-package.controller'
import { AdminPackageService } from './admin-package.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { UpdatePackageDto } from './dto/update-package.dto'
import { UpdatePackageStatusDto } from './dto/update-package-status.dto'

/** 构造 Mock 套餐实体 */
function createMockPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'pkg-001',
    name: '9.9 体验套餐',
    description: '体验套餐',
    price: 9.9,
    originalPrice: 19.9,
    points: 100,
    bonusPoints: 20,
    duration: 30,
    features: ['功能1', '功能2'],
    type: PackageType.ONE_TIME,
    status: PackageStatus.OFFLINE,
    sort: 0,
    createdAt: new Date('2025-01-01'),
    userPackages: [],
    orders: [],
    ...overrides,
  } as Package
}

describe('AdminPackageController', () => {
  let controller: AdminPackageController
  let reflector: Reflector
  let service: jest.Mocked<AdminPackageService>

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<AdminPackageService>

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminPackageController],
      providers: [Reflector, { provide: AdminPackageService, useValue: service }],
    }).compile()

    controller = moduleRef.get(AdminPackageController)
    reflector = moduleRef.get(Reflector)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- POST / (create) --------------------

  describe('create', () => {
    it('调用 service.create 并返回创建的套餐', async () => {
      const dto: CreatePackageDto = {
        name: '月度订阅',
        price: 29.9,
        type: PackageType.SUBSCRIPTION,
      }
      const mockPackage = createMockPackage({ name: '月度订阅', price: 29.9 })
      service.create.mockResolvedValue(mockPackage)

      const result = await controller.create(dto)

      expect(service.create).toHaveBeenCalledWith(dto)
      expect(result).toBe(mockPackage)
    })
  })

  // -------------------- PUT /:id (update) --------------------

  describe('update', () => {
    it('调用 service.update 并返回更新后的套餐', async () => {
      const dto: UpdatePackageDto = { name: '新名称' }
      const mockPackage = createMockPackage({ id: 'pkg-1', name: '新名称' })
      service.update.mockResolvedValue(mockPackage)

      const result = await controller.update('pkg-1', dto)

      expect(service.update).toHaveBeenCalledWith('pkg-1', dto)
      expect(result).toBe(mockPackage)
    })
  })

  // -------------------- PUT /:id/status --------------------

  describe('updateStatus', () => {
    it('调用 service.updateStatus 并返回更新后的套餐', async () => {
      const dto: UpdatePackageStatusDto = { status: PackageStatus.ACTIVE }
      const mockPackage = createMockPackage({
        id: 'pkg-1',
        status: PackageStatus.ACTIVE,
      })
      service.updateStatus.mockResolvedValue(mockPackage)

      const result = await controller.updateStatus('pkg-1', dto)

      expect(service.updateStatus).toHaveBeenCalledWith('pkg-1', dto)
      expect(result).toBe(mockPackage)
    })
  })

  // -------------------- GET / (findAll) --------------------

  describe('findAll', () => {
    it('调用 service.findAll 并返回套餐列表', async () => {
      const mockList = [createMockPackage({ id: 'pkg-1' }), createMockPackage({ id: 'pkg-2' })]
      service.findAll.mockResolvedValue(mockList)

      const result = await controller.findAll()

      expect(service.findAll).toHaveBeenCalled()
      expect(result).toBe(mockList)
      expect(result).toHaveLength(2)
    })
  })

  // -------------------- 权限元数据校验 --------------------

  describe('权限装饰器', () => {
    it('Controller 级别应声明 @Roles("ADMIN", "SUPER_ADMIN")', () => {
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [controller.constructor])
      expect(roles).toEqual(['ADMIN', 'SUPER_ADMIN'])
    })

    it('各端点方法继承 Controller 级别的 @Roles 元数据', () => {
      const createRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.create,
        controller.constructor,
      ])
      expect(createRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])

      const updateRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.update,
        controller.constructor,
      ])
      expect(updateRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])

      const updateStatusRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.updateStatus,
        controller.constructor,
      ])
      expect(updateStatusRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])

      const findAllRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.findAll,
        controller.constructor,
      ])
      expect(findAllRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])
    })
  })
})
