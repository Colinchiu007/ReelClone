/**
 * UploadReconciliationService 单元测试
 *
 * 测试覆盖:
 *  - 无超时模板（空扫描）
 *  - workflowId 为空 → 标记失败
 *  - Temporal status=RUNNING → 取消工作流 + 标记失败
 *  - Temporal status=COMPLETED → 跳过
 *  - Temporal status=FAILED/TIMED_OUT/TERMINATED/CANCELLED → 标记失败
 *  - Temporal 查询抛错（NotFound） → 标记失败
 *  - 单模板对账失败（markFailed 抛错）不中断整体
 *  - markFailed 状态校验幂等（affected=0 不报错）
 */
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DATABASE_CONNECTIONS, Template, TemplateStatus } from '@reelclone/database'
import { TemporalService } from '@reelclone/temporal'
import { UploadReconciliationService } from './upload-reconciliation.service'

// -------------------- Mock 工具 --------------------

function createQueryBuilderMock(): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {}
  // select 模式
  qb.where = jest.fn().mockReturnThis()
  qb.andWhere = jest.fn().mockReturnThis()
  qb.orderBy = jest.fn().mockReturnThis()
  qb.take = jest.fn().mockReturnThis()
  qb.getMany = jest.fn()
  // update 模式
  qb.update = jest.fn().mockReturnThis()
  qb.set = jest.fn().mockReturnThis()
  qb.execute = jest.fn()
  return qb
}

function createMockTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-001',
    title: '测试模板',
    workflowId: 'wf-001',
    status: TemplateStatus.ANALYZING,
    updatedAt: new Date('2025-01-01'),
    failureReason: null,
    ...overrides,
  } as Template
}

/** 构造 Temporal describe 返回值（status 是 { code, name } 对象） */
function wfDescribe(name: string) {
  return { status: { code: 0, name }, runId: 'run-x' } as never
}

// -------------------- 测试 --------------------

describe('UploadReconciliationService', () => {
  let service: UploadReconciliationService
  let repo: jest.Mocked<Repository<Template>>
  let temporalService: jest.Mocked<TemporalService>
  let qb: Record<string, jest.Mock>

  beforeEach(async () => {
    qb = createQueryBuilderMock()
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as jest.Mocked<Repository<Template>>

    temporalService = {
      getWorkflowStatus: jest.fn(),
      cancelWorkflow: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TemporalService>

    const moduleRef = await Test.createTestingModule({
      providers: [
        UploadReconciliationService,
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: repo,
        },
        { provide: TemporalService, useValue: temporalService },
      ],
    }).compile()

    service = moduleRef.get(UploadReconciliationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- 空扫描 --------------------

  it('无超时模板：应返回 scannedCount=0 且无副作用', async () => {
    qb.getMany.mockResolvedValue([])

    const result = await service.reconcile()

    expect(result).toEqual({
      scannedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      details: [],
    })
    expect(temporalService.getWorkflowStatus).not.toHaveBeenCalled()
  })

  // -------------------- workflowId 为空 --------------------

  it('workflowId 为空：应直接标记失败（不查询 Temporal）', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-null', workflowId: null })])
    qb.execute.mockResolvedValue({ affected: 1, raw: [] })

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(temporalService.getWorkflowStatus).not.toHaveBeenCalled()
    expect(qb.set).toHaveBeenCalledWith({
      status: TemplateStatus.ANALYSIS_FAILED,
      failureReason: expect.stringContaining('工作流未启动'),
    })
    expect(qb.where).toHaveBeenCalledWith('id = :id AND status = :status', {
      id: 'tmpl-null',
      status: TemplateStatus.ANALYZING,
    })
  })

  // -------------------- RUNNING 超时 --------------------

  it('Temporal status=RUNNING：应取消工作流并标记失败', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-running' })])
    temporalService.getWorkflowStatus.mockResolvedValue(wfDescribe('RUNNING'))
    qb.execute.mockResolvedValue({ affected: 1, raw: [] })

    const result = await service.reconcile()

    expect(result.failedCount).toBe(1)
    expect(temporalService.getWorkflowStatus).toHaveBeenCalledWith('wf-001')
    expect(temporalService.cancelWorkflow).toHaveBeenCalledWith('wf-001')
    expect(qb.set).toHaveBeenCalledWith({
      status: TemplateStatus.ANALYSIS_FAILED,
      failureReason: expect.stringContaining('工作流超时未完成'),
    })
  })

  it('Temporal status=RUNNING 且 cancelWorkflow 抛错：应忽略取消错误仍标记失败', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate()])
    temporalService.getWorkflowStatus.mockResolvedValue(wfDescribe('RUNNING'))
    temporalService.cancelWorkflow.mockRejectedValue(new Error('cancel failed'))
    qb.execute.mockResolvedValue({ affected: 1, raw: [] })

    const result = await service.reconcile()

    expect(result.failedCount).toBe(1)
    // 取消失败不应阻塞标记失败流程
    expect(qb.set).toHaveBeenCalled()
  })

  // -------------------- COMPLETED 跳过 --------------------

  it('Temporal status=COMPLETED：应跳过不更新', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate()])
    temporalService.getWorkflowStatus.mockResolvedValue(wfDescribe('COMPLETED'))

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    // 不应调用 update
    expect(qb.update).not.toHaveBeenCalled()
    expect(qb.set).not.toHaveBeenCalled()
  })

  // -------------------- FAILED/TIMED_OUT/TERMINATED/CANCELLED --------------------

  it.each(['FAILED', 'TIMED_OUT', 'TERMINATED', 'CANCELLED'])(
    'Temporal status=%s：应标记失败',
    async (status) => {
      qb.getMany.mockResolvedValue([createMockTemplate()])
      temporalService.getWorkflowStatus.mockResolvedValue(wfDescribe(status))
      qb.execute.mockResolvedValue({ affected: 1, raw: [] })

      const result = await service.reconcile()

      expect(result.failedCount).toBe(1)
      expect(qb.set).toHaveBeenCalledWith({
        status: TemplateStatus.ANALYSIS_FAILED,
        failureReason: expect.stringContaining(status),
      })
    },
  )

  // -------------------- 工作流查询抛错 --------------------

  it('Temporal 查询抛错（NotFound）：应标记失败，原因包含错误信息', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate()])
    temporalService.getWorkflowStatus.mockRejectedValue(new Error('workflow not found'))
    qb.execute.mockResolvedValue({ affected: 1, raw: [] })

    const result = await service.reconcile()

    expect(result.failedCount).toBe(1)
    expect(qb.set).toHaveBeenCalledWith({
      status: TemplateStatus.ANALYSIS_FAILED,
      failureReason: expect.stringContaining('工作流查询失败'),
    })
  })

  // -------------------- 单模板对账失败不中断（markFailed 抛错）--------------------

  it('单模板 markFailed 抛错：不应中断整体流程', async () => {
    const templates = [createMockTemplate({ id: 'tmpl-1' }), createMockTemplate({ id: 'tmpl-2' })]
    qb.getMany.mockResolvedValue(templates)

    // tmpl-1: FAILED 状态但 markFailed 抛 DB 错误（外层 catch 捕获）
    // tmpl-2: COMPLETED 跳过
    temporalService.getWorkflowStatus
      .mockResolvedValueOnce(wfDescribe('FAILED'))
      .mockResolvedValueOnce(wfDescribe('COMPLETED'))

    // 第一次 execute（tmpl-1）抛错，第二次不调用（COMPLETED 跳过）
    qb.execute.mockRejectedValueOnce(new Error('DB connection lost'))

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(2)
    expect(result.errorCount).toBe(1) // tmpl-1 markFailed 抛错
    expect(result.skippedCount).toBe(1) // tmpl-2 COMPLETED
    expect(result.failedCount).toBe(0)
    // 应继续处理 tmpl-2，不中断
    expect(temporalService.getWorkflowStatus).toHaveBeenCalledTimes(2)
  })

  // -------------------- markFailed 幂等 --------------------

  it('markFailed 状态已被其他流程更新（affected=0）：不应报错', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate({ id: 'tmpl-racing' })])
    temporalService.getWorkflowStatus.mockResolvedValue(wfDescribe('FAILED'))
    // 模拟并发竞态：UPDATE 时 status 已被其他流程改为 ACTIVE/FINALIZED
    qb.execute.mockResolvedValue({ affected: 0, raw: [] })

    const result = await service.reconcile()

    // 仍标记为 marked_failed（因为 reconcileOne 内部不知道 affected=0）
    // 但 markFailed 不会抛错
    expect(result.failedCount).toBe(1)
    expect(qb.execute).toHaveBeenCalled()
  })

  // -------------------- CONTINUED_AS_NEW / 未知状态 --------------------

  it('Temporal 未知状态（CONTINUED_AS_NEW）：应保守标记失败', async () => {
    qb.getMany.mockResolvedValue([createMockTemplate()])
    temporalService.getWorkflowStatus.mockResolvedValue(wfDescribe('CONTINUED_AS_NEW'))
    qb.execute.mockResolvedValue({ affected: 1, raw: [] })

    const result = await service.reconcile()

    expect(result.failedCount).toBe(1)
    expect(qb.set).toHaveBeenCalledWith({
      status: TemplateStatus.ANALYSIS_FAILED,
      failureReason: expect.stringContaining('CONTINUED_AS_NEW'),
    })
  })

  // -------------------- 多模板混合场景 --------------------

  it('多模板混合场景：应正确分类处理', async () => {
    const templates = [
      createMockTemplate({ id: 't-null', workflowId: null }),
      createMockTemplate({ id: 't-running', workflowId: 'wf-running' }),
      createMockTemplate({ id: 't-completed', workflowId: 'wf-completed' }),
      createMockTemplate({ id: 't-failed', workflowId: 'wf-failed' }),
    ]
    qb.getMany.mockResolvedValue(templates)

    temporalService.getWorkflowStatus
      .mockResolvedValueOnce(wfDescribe('RUNNING')) // t-running
      .mockResolvedValueOnce(wfDescribe('COMPLETED')) // t-completed
      .mockResolvedValueOnce(wfDescribe('FAILED')) // t-failed
    qb.execute.mockResolvedValue({ affected: 1, raw: [] })

    const result = await service.reconcile()

    expect(result.scannedCount).toBe(4)
    expect(result.failedCount).toBe(3) // t-null + t-running + t-failed
    expect(result.skippedCount).toBe(1) // t-completed
    // t-null 不查询 Temporal，其他 3 个查询
    expect(temporalService.getWorkflowStatus).toHaveBeenCalledTimes(3)
    // t-running 取消工作流
    expect(temporalService.cancelWorkflow).toHaveBeenCalledTimes(1)
    expect(temporalService.cancelWorkflow).toHaveBeenCalledWith('wf-running')
  })
})
