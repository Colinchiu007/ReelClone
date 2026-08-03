/**
 * RewardReconciliationService 单元测试
 *
 * 覆盖（P1-10 间隙补偿回归）：
 *  - 无漏发：ordinals 完整覆盖 [1..useCount]
 *  - 连续漏发：补发缺失的连续序号
 *  - 间隙漏发（P1-10 核心）：ordinals=[1,2,4,5] useCount=5 → 只补发 3
 *  - 多间隙：ordinals=[1,3,5] useCount=5 → 补发 [2,4]
 *  - 全漏发：ordinals=[] useCount=3 → 补发 [1,2,3]
 *  - 补发部分失败：reward 抛异常时 reissued/failed 正确统计
 *  - getRewardOrdinals 失败：跳过该模板，不中断整体对账
 *  - 超限截断：missingOrdinals > MAX_REISSUE_PER_TEMPLATE 时只补发 50 条
 *  - 空模板列表：scannedCount=0
 */
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DATABASE_CONNECTIONS, Template } from '@reelclone/database'
import { RewardReconciliationService } from './reward-reconciliation.service'
import { BillingClient } from './billing.client'

// -------------------- Mock 工具 --------------------

function createQueryBuilderMock(): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {}
  qb.where = jest.fn().mockReturnThis()
  qb.andWhere = jest.fn().mockReturnThis()
  qb.orderBy = jest.fn().mockReturnThis()
  qb.take = jest.fn().mockReturnThis()
  qb.getMany = jest.fn()
  return qb
}

function createMockTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-001',
    userId: 'user-001',
    useCount: 3,
    ...overrides,
  } as Template
}

// -------------------- 测试 --------------------

describe('RewardReconciliationService', () => {
  let service: RewardReconciliationService
  let templateRepo: jest.Mocked<Repository<Template>>
  let billingClient: jest.Mocked<BillingClient>
  let qb: Record<string, jest.Mock>

  beforeEach(async () => {
    qb = createQueryBuilderMock()
    templateRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as jest.Mocked<Repository<Template>>

    billingClient = {
      getRewardOrdinals: jest.fn(),
      reward: jest.fn(),
    } as unknown as jest.Mocked<BillingClient>

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RewardReconciliationService,
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: templateRepo,
        },
        { provide: BillingClient, useValue: billingClient },
      ],
    }).compile()

    service = moduleRef.get(RewardReconciliationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- 1. 无漏发：ordinals 完整覆盖 --------------------

  it('无漏发：ordinals 完整覆盖 [1..useCount]，应不补发', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ useCount: 3 })])
    billingClient.getRewardOrdinals.mockResolvedValue([1, 2, 3])

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(1)
    expect(result.underpaidCount).toBe(0)
    expect(result.reissuedCount).toBe(0)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(0)
    expect(billingClient.reward).not.toHaveBeenCalled()
  })

  // -------------------- 2. 连续漏发 --------------------

  it('连续漏发：ordinals=[1,2] useCount=3，应补发缺失的 3', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-001', useCount: 3 })])
    billingClient.getRewardOrdinals.mockResolvedValue([1, 2])
    billingClient.reward.mockResolvedValue({ balance: 100, transactionId: 'tx-001' } as never)

    const result = await service.reconcile()

    expect(result.underpaidCount).toBe(1)
    expect(result.reissuedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(1)
    expect(result.details[0].missingOrdinals).toEqual([3])
    expect(result.details[0].reissued).toBe(1)
    expect(result.details[0].failed).toBe(0)
    expect(billingClient.reward).toHaveBeenCalledTimes(1)
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-001',
        templateId: 'tmpl-001',
        idempotencyKey: 'reward:template:tmpl-001:use:3',
      }),
    )
  })

  // -------------------- 3. 间隙漏发（P1-10 核心场景） --------------------

  it('间隙漏发（P1-10 核心）：ordinals=[1,2,4,5] useCount=5，应只补发 3', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-p110', userId: 'user-p110', useCount: 5 })])
    billingClient.getRewardOrdinals.mockResolvedValue([1, 2, 4, 5])
    billingClient.reward.mockResolvedValue({ balance: 100, transactionId: 'tx-001' } as never)

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(1)
    expect(result.underpaidCount).toBe(1)
    expect(result.reissuedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(1)
    expect(result.details[0].templateId).toBe('tmpl-p110')
    expect(result.details[0].missingOrdinals).toEqual([3])
    expect(result.details[0].reissued).toBe(1)
    expect(result.details[0].failed).toBe(0)
    expect(billingClient.reward).toHaveBeenCalledTimes(1)
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-p110',
        templateId: 'tmpl-p110',
        idempotencyKey: 'reward:template:tmpl-p110:use:3',
      }),
    )
  })

  // -------------------- 4. 多间隙 --------------------

  it('多间隙：ordinals=[1,3,5] useCount=5，应补发 [2,4]', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-gap', useCount: 5 })])
    billingClient.getRewardOrdinals.mockResolvedValue([1, 3, 5])
    billingClient.reward.mockResolvedValue({ balance: 100, transactionId: 'tx-001' } as never)

    const result = await service.reconcile()

    expect(result.underpaidCount).toBe(1)
    expect(result.reissuedCount).toBe(2)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(1)
    expect(result.details[0].missingOrdinals).toEqual([2, 4])
    expect(result.details[0].reissued).toBe(2)
    expect(billingClient.reward).toHaveBeenCalledTimes(2)
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'reward:template:tmpl-gap:use:2' }),
    )
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'reward:template:tmpl-gap:use:4' }),
    )
  })

  // -------------------- 5. 全漏发 --------------------

  it('全漏发：ordinals=[] useCount=3，应补发 [1,2,3]', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-all', useCount: 3 })])
    billingClient.getRewardOrdinals.mockResolvedValue([])
    billingClient.reward.mockResolvedValue({ balance: 100, transactionId: 'tx-001' } as never)

    const result = await service.reconcile()

    expect(result.underpaidCount).toBe(1)
    expect(result.reissuedCount).toBe(3)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(1)
    expect(result.details[0].missingOrdinals).toEqual([1, 2, 3])
    expect(result.details[0].reissued).toBe(3)
    expect(billingClient.reward).toHaveBeenCalledTimes(3)
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'reward:template:tmpl-all:use:1' }),
    )
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'reward:template:tmpl-all:use:2' }),
    )
    expect(billingClient.reward).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'reward:template:tmpl-all:use:3' }),
    )
  })

  // -------------------- 6. 补发部分失败 --------------------

  it('补发部分失败：reward 抛异常时 reissued/failed 应正确统计', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-fail', useCount: 3 })])
    billingClient.getRewardOrdinals.mockResolvedValue([1, 2])
    // reward 对 n=3 抛异常
    billingClient.reward.mockRejectedValue(new Error('insufficient balance'))

    const result = await service.reconcile()

    expect(result.underpaidCount).toBe(1)
    expect(result.reissuedCount).toBe(0)
    expect(result.failedCount).toBe(1)
    expect(result.details).toHaveLength(1)
    expect(result.details[0].missingOrdinals).toEqual([3])
    expect(result.details[0].reissued).toBe(0)
    expect(result.details[0].failed).toBe(1)
    expect(billingClient.reward).toHaveBeenCalledTimes(1)
  })

  // -------------------- 7. getRewardOrdinals 调用失败不中断 --------------------

  it('getRewardOrdinals 调用失败：应跳过该模板，不中断整体对账', async () => {
    const templates = [
      createMockTemplate({ id: 'tmpl-err', userId: 'user-err', useCount: 3 }),
      createMockTemplate({ id: 'tmpl-ok', userId: 'user-ok', useCount: 2 }),
    ]
    qb.getMany.mockResolvedValue(templates)

    // tmpl-err: getRewardOrdinals 抛错
    billingClient.getRewardOrdinals
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce([1, 2]) // tmpl-ok: ordinals 完整

    const result = await service.reconcile()

    // 两个模板都被扫描
    expect(result.scannedCount).toBe(2)
    // tmpl-err 对账失败被 catch，tmpl-ok 无漏发
    expect(result.underpaidCount).toBe(0)
    expect(result.reissuedCount).toBe(0)
    expect(result.failedCount).toBe(0)
    // getRewardOrdinals 被调用了 2 次（两个模板各一次）
    expect(billingClient.getRewardOrdinals).toHaveBeenCalledTimes(2)
    // reward 不应被调用
    expect(billingClient.reward).not.toHaveBeenCalled()
  })

  // -------------------- 8. 超限截断 --------------------

  it('超限截断：missingOrdinals > MAX_REISSUE_PER_TEMPLATE(50) 时只补发 50 条', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-big', useCount: 60 })])
    billingClient.getRewardOrdinals.mockResolvedValue([])
    billingClient.reward.mockResolvedValue({ balance: 100, transactionId: 'tx-001' } as never)

    const result = await service.reconcile()

    expect(result.underpaidCount).toBe(1)
    // missingOrdinals 有 60 项，但只补发 50 项
    expect(result.reissuedCount).toBe(50)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(1)
    expect(result.details[0].missingOrdinals).toHaveLength(60)
    expect(result.details[0].reissued).toBe(50)
    expect(billingClient.reward).toHaveBeenCalledTimes(50)
    // 最后一次补发的幂等键是 n=50
    expect(billingClient.reward).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: 'reward:template:tmpl-big:use:50',
      }),
    )
  })

  // -------------------- 9. 空模板列表 --------------------

  it('空模板列表：getMany 返回 []，应返回 scannedCount=0', async () => {
    qb.getMany.mockResolvedValue([])

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(0)
    expect(result.underpaidCount).toBe(0)
    expect(result.reissuedCount).toBe(0)
    expect(result.failedCount).toBe(0)
    expect(result.details).toHaveLength(0)
    expect(billingClient.getRewardOrdinals).not.toHaveBeenCalled()
    expect(billingClient.reward).not.toHaveBeenCalled()
  })
})
