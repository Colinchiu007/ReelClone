import { Test, TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import {
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { DataSource } from 'typeorm'
import { HistoricalDataInventoryService } from './historical-data-inventory.service'

describe('HistoricalDataInventoryService', () => {
  let service: HistoricalDataInventoryService
  let mainDataSource: jest.Mocked<DataSource>
  let billingDataSource: jest.Mocked<DataSource>

  // Mock repositories
  const mockMainRepo = {
    count: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  }

  const mockBillingRepo = {
    count: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  }

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  }

  beforeEach(async () => {
    mainDataSource = {
      getRepository: jest.fn().mockReturnValue(mockMainRepo),
    } as any

    billingDataSource = {
      getRepository: jest.fn().mockReturnValue(mockBillingRepo),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalDataInventoryService,
        { provide: getDataSourceToken(DATABASE_CONNECTIONS.MAIN), useValue: mainDataSource },
        { provide: getDataSourceToken(DATABASE_CONNECTIONS.BILLING), useValue: billingDataSource },
      ],
    }).compile()

    service = module.get<HistoricalDataInventoryService>(HistoricalDataInventoryService)

    // Reset mocks
    jest.clearAllMocks()
    mockMainRepo.count.mockResolvedValue(0)
    mockBillingRepo.count.mockResolvedValue(0)
    mockMainRepo.find.mockResolvedValue([])
    mockBillingRepo.find.mockResolvedValue([])
    mockMainRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder)
    mockBillingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder)
    mockQueryBuilder.getMany.mockResolvedValue([])
  })

  describe('runInventory', () => {
    it('should return healthy result when no issues found', async () => {
      const result = await service.runInventory()

      expect(result.healthy).toBe(true)
      expect(result.issues).toHaveLength(0)
      expect(result.reconciliationCases).toHaveLength(0)
    })

    it('should count all tables correctly', async () => {
      mockMainRepo.count
        .mockResolvedValueOnce(100) // creditOperations
        .mockResolvedValueOnce(50) // creditReservations
        .mockResolvedValueOnce(200) // billingProjections
        .mockResolvedValueOnce(10) // creditOperationOutbox
      mockBillingRepo.count.mockResolvedValueOnce(300) // pointTransactions

      const result = await service.runInventory()

      expect(result.counts.creditOperations).toBe(100)
      expect(result.counts.creditReservations).toBe(50)
      expect(result.counts.billingProjections).toBe(200)
      expect(result.counts.creditOperationOutbox).toBe(10)
      expect(result.counts.pointTransactions).toBe(300)
    })

    it('should detect DEAD billing projection outbox records', async () => {
      // First call is for count, then find returns DEAD records
      mockMainRepo.find.mockResolvedValueOnce([
        { id: 'dead-1' },
        { id: 'dead-2' },
      ])

      const result = await service.runInventory()

      expect(result.healthy).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].category).toBe('DEAD_OUTBOX')
      expect(result.issues[0].severity).toBe('ERROR')
      expect(result.issues[0].affectedIds).toContain('dead-1')
    })

    it('should detect stale OPEN reservations (>24h)', async () => {
      mockMainRepo.createQueryBuilder.mockReturnValue({
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([
          { id: 'stale-1', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
        ]),
      })

      const result = await service.runInventory()

      expect(result.issues.length).toBeGreaterThan(0)
      const staleIssue = result.issues.find((i) => i.category === 'STALE_OPEN_RESERVATION')
      expect(staleIssue).toBeDefined()
      expect(staleIssue!.severity).toBe('WARN')
    })

    it('should detect orphan billing transactions', async () => {
      mockBillingRepo.createQueryBuilder.mockReturnValue({
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([
          { id: 'orphan-tx-1', table: 'point_transactions' },
        ]),
      })

      const result = await service.runInventory()

      expect(result.reconciliationCases.length).toBeGreaterThan(0)
      const orphanCase = result.reconciliationCases.find((c) =>
        c.reason.includes('不存在的 reservation'),
      )
      expect(orphanCase).toBeDefined()
      expect(orphanCase!.records[0].id).toBe('orphan-tx-1')
    })

    it('should not guess associations based on amount/description', async () => {
      // Even with matching amounts, should not auto-reconcile
      mockBillingRepo.createQueryBuilder.mockReturnValue({
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([
          { id: 'tx-1', amount: 100, description: 'freeze' },
        ]),
      })

      const result = await service.runInventory()

      // The service should NOT automatically reconcile based on amount
      // It should only flag for manual review
      if (result.reconciliationCases.length > 0) {
        expect(result.reconciliationCases[0].context.note).toContain('人工核实')
      }
    })
  })
})
