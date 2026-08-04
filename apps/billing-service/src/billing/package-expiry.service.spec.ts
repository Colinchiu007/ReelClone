/**
 * PackageExpiryService 单元测试
 *
 * 覆盖：
 *  - expireOverduePackages：正常过期 / 无过期套餐 / 批量分批处理
 */
import { DataSource, ObjectLiteral, Repository } from 'typeorm'
import { UserPackageStatus } from '@reelclone/database'
import { PackageExpiryService } from './package-expiry.service'

function mockRepo(): jest.Mocked<Repository<ObjectLiteral>> {
  return {
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<Repository<ObjectLiteral>>
}

function mockDataSource(): jest.Mocked<DataSource> {
  return {
    getRepository: jest.fn(),
  } as unknown as jest.Mocked<DataSource>
}

function mockQb(rawManyResult: { id: string }[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawManyResult),
  }
}

describe('PackageExpiryService', () => {
  let service: PackageExpiryService
  let dataSource: jest.Mocked<DataSource>
  let repo: jest.Mocked<Repository<ObjectLiteral>>

  beforeEach(() => {
    dataSource = mockDataSource()
    repo = mockRepo()
    dataSource.getRepository.mockReturnValue(repo)
    service = new PackageExpiryService(dataSource)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('expireOverduePackages', () => {
    it('should expire overdue packages and return count', async () => {
      const qb = mockQb([{ id: 'uuid-1' }, { id: 'uuid-2' }])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as ReturnType<DataSource['createQueryBuilder']>)
      repo.update.mockResolvedValue({ affected: 2 } as never)

      const result = await service.expireOverduePackages()

      expect(result).toBe(2)
      expect(repo.update).toHaveBeenCalledTimes(1)
      const [, set] = repo.update.mock.calls[0]
      expect(set).toEqual({ status: UserPackageStatus.EXPIRED })
    })

    it('should return 0 when no overdue packages', async () => {
      const qb = mockQb([])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as ReturnType<DataSource['createQueryBuilder']>)

      const result = await service.expireOverduePackages()

      expect(result).toBe(0)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('should process in batches of 500', async () => {
      const firstBatch = Array.from({ length: 500 }, (_, i) => ({ id: `uuid-${i}` }))
      const secondBatch = Array.from({ length: 100 }, (_, i) => ({ id: `uuid-${500 + i}` }))

      const qb1 = mockQb(firstBatch)
      const qb2 = mockQb(secondBatch)
      repo.createQueryBuilder
        .mockReturnValueOnce(qb1 as unknown as ReturnType<DataSource['createQueryBuilder']>)
        .mockReturnValueOnce(qb2 as unknown as ReturnType<DataSource['createQueryBuilder']>)
      repo.update
        .mockResolvedValueOnce({ affected: 500 } as never)
        .mockResolvedValueOnce({ affected: 100 } as never)

      const result = await service.expireOverduePackages()

      expect(result).toBe(600)
      expect(repo.update).toHaveBeenCalledTimes(2)
    })
  })
})
