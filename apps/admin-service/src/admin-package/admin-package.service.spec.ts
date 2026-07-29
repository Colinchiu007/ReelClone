/**
 * AdminPackageService 单元测试
 *
 * 测试覆盖:
 *  - create: 默认状态 OFFLINE、字段填充、调用 save
 *  - update: 找到 / 不存在抛 NOT_FOUND / 合并字段
 *  - updateStatus: 找到 / 不存在抛 NOT_FOUND / 状态流转 ACTIVE↔OFFLINE
 *  - findAll: 全状态、按 sort ASC、createdAt DESC 排序
 */
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Package, PackageStatus, PackageType, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
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

describe('AdminPackageService', () => {
  let service: AdminPackageService
  let repo: jest.Mocked<Repository<Package>>

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Package>>

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPackageService,
        {
          provide: getRepositoryToken(Package, DATABASE_CONNECTIONS.MAIN),
          useValue: repo,
        },
      ],
    }).compile()

    service = moduleRef.get(AdminPackageService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- create --------------------

  describe('create', () => {
    it('创建套餐时默认状态为 OFFLINE', async () => {
      const dto: CreatePackageDto = {
        name: '月度订阅',
        price: 29.9,
        type: PackageType.SUBSCRIPTION,
      }
      const created = createMockPackage({ name: '月度订阅', price: 29.9 })
      repo.create.mockReturnValue(created)
      repo.save.mockResolvedValue(created)

      const result = await service.create(dto)

      expect(result).toBe(created)
      expect(repo.create).toHaveBeenCalledWith({
        name: '月度订阅',
        description: null,
        price: 29.9,
        originalPrice: null,
        points: 0,
        bonusPoints: 0,
        duration: 0,
        features: [],
        type: PackageType.SUBSCRIPTION,
        status: PackageStatus.OFFLINE,
        sort: 0,
      })
      expect(repo.save).toHaveBeenCalledWith(created)
    })

    it('传入可选字段时正确填充', async () => {
      const dto: CreatePackageDto = {
        name: '年卡',
        description: '年度订阅套餐',
        price: 299,
        originalPrice: 399,
        points: 12000,
        bonusPoints: 2000,
        duration: 365,
        features: ['优先客服', '专属模板'],
        type: PackageType.SUBSCRIPTION,
        sort: 10,
      }
      const created = createMockPackage({ name: '年卡' })
      repo.create.mockReturnValue(created)
      repo.save.mockResolvedValue(created)

      await service.create(dto)

      expect(repo.create).toHaveBeenCalledWith({
        name: '年卡',
        description: '年度订阅套餐',
        price: 299,
        originalPrice: 399,
        points: 12000,
        bonusPoints: 2000,
        duration: 365,
        features: ['优先客服', '专属模板'],
        type: PackageType.SUBSCRIPTION,
        status: PackageStatus.OFFLINE,
        sort: 10,
      })
    })
  })

  // -------------------- update --------------------

  describe('update', () => {
    it('套餐存在时合并字段并保存', async () => {
      const existing = createMockPackage({ id: 'pkg-1', name: '旧名称' })
      const dto: UpdatePackageDto = { name: '新名称', price: 19.9 }
      const saved = { ...existing, name: '新名称', price: 19.9 }
      repo.findOne.mockResolvedValue(existing)
      repo.save.mockResolvedValue(saved as Package)

      const result = await service.update('pkg-1', dto)

      expect(result).toBe(saved)
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'pkg-1' } })
      expect(repo.save).toHaveBeenCalledWith(existing)
      // 字段已被合并
      expect(existing.name).toBe('新名称')
      expect(existing.price).toBe(19.9)
    })

    it('套餐不存在时抛出 NOT_FOUND 异常', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(service.update('not-exist', { name: 'x' })).rejects.toThrow(BusinessException)

      try {
        await service.update('not-exist', { name: 'x' })
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
        expect((e as BusinessException).message).toContain('套餐')
      }
      expect(repo.save).not.toHaveBeenCalled()
    })
  })

  // -------------------- updateStatus --------------------

  describe('updateStatus', () => {
    it('上架：OFFLINE → ACTIVE', async () => {
      const existing = createMockPackage({
        id: 'pkg-1',
        status: PackageStatus.OFFLINE,
      })
      const dto: UpdatePackageStatusDto = { status: PackageStatus.ACTIVE }
      repo.findOne.mockResolvedValue(existing)
      repo.save.mockResolvedValue(existing)

      const result = await service.updateStatus('pkg-1', dto)

      expect(result).toBe(existing)
      expect(existing.status).toBe(PackageStatus.ACTIVE)
      expect(repo.save).toHaveBeenCalledWith(existing)
    })

    it('下架：ACTIVE → OFFLINE', async () => {
      const existing = createMockPackage({
        id: 'pkg-1',
        status: PackageStatus.ACTIVE,
      })
      const dto: UpdatePackageStatusDto = { status: PackageStatus.OFFLINE }
      repo.findOne.mockResolvedValue(existing)
      repo.save.mockResolvedValue(existing)

      const result = await service.updateStatus('pkg-1', dto)

      expect(result).toBe(existing)
      expect(existing.status).toBe(PackageStatus.OFFLINE)
    })

    it('套餐不存在时抛出 NOT_FOUND 异常', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(
        service.updateStatus('not-exist', { status: PackageStatus.ACTIVE }),
      ).rejects.toThrow(BusinessException)

      try {
        await service.updateStatus('not-exist', {
          status: PackageStatus.ACTIVE,
        })
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
      }
      expect(repo.save).not.toHaveBeenCalled()
    })
  })

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('返回全状态套餐，按 sort ASC、createdAt DESC 排序', async () => {
      const mockList = [
        createMockPackage({ id: 'pkg-1', status: PackageStatus.ACTIVE, sort: 0 }),
        createMockPackage({ id: 'pkg-2', status: PackageStatus.OFFLINE, sort: 1 }),
      ]
      repo.find.mockResolvedValue(mockList)

      const result = await service.findAll()

      expect(result).toEqual(mockList)
      expect(repo.find).toHaveBeenCalledWith({
        order: { sort: 'ASC', createdAt: 'DESC' },
      })
    })

    it('无套餐时返回空数组', async () => {
      repo.find.mockResolvedValue([])

      const result = await service.findAll()

      expect(result).toEqual([])
      expect(repo.find).toHaveBeenCalled()
    })
  })
})
