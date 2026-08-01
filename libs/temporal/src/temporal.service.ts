/**
 * TemporalService - NestJS 可注入服务
 *
 * 封装 Temporal Client 操作，供业务服务（workbench / benchmark）注入使用。
 * 通过 @Injectable() 装饰，在 TemporalModule.forRoot() 时提供。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Client } from '@temporalio/client'
import { WorkflowNotFoundError } from '@temporalio/common'
import { getClient, closeClient } from './client/temporal.client'
import {
  TASK_QUEUE,
  WORKFLOW_ID_PREFIX,
  type BenchmarkParams,
  type GenerationReconcilerParams,
  type TemplateGenerationInput,
  type VideoGenParams,
} from './types'

@Injectable()
export class TemporalService {
  private readonly logger = new Logger(TemporalService.name)
  private clientPromise: Promise<Client> | null = null

  constructor(private readonly configService: ConfigService) {}

  /**
   * 获取 Temporal Client（懒加载单例）
   */
  async getClient(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = getClient({
        address: this.configService.get<string>('TEMPORAL_ADDRESS'),
        namespace: this.configService.get<string>('TEMPORAL_NAMESPACE') || 'reelclone',
      })
    }
    return this.clientPromise
  }

  /**
   * 启动视频生成工作流
   */
  getVideoGenerationWorkflowId(
    params: Pick<VideoGenParams, 'workId' | 'generationTaskId'>,
  ): string {
    return `${WORKFLOW_ID_PREFIX.VIDEO_GEN}-${params.workId}-${params.generationTaskId}`
  }

  async startVideoGeneration(params: VideoGenParams): Promise<string> {
    const client = await this.getClient()
    // 重试会为同一 Work 创建新的 GenerationTask，因此 workflowId 必须由任务维度区分。
    const workflowId = this.getVideoGenerationWorkflowId(params)

    await client.workflow.start('videoGenerationWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUE.VIDEO_GENERATION,
      args: [params],
      workflowExecutionTimeout: '15 minutes',
      retry: {
        initialInterval: '10 seconds',
        maximumInterval: '1 minute',
        backoffCoefficient: 2,
        maximumAttempts: 1,
      },
    })

    this.logger.log(`视频生成工作流已启动 workId=${params.workId} workflowId=${workflowId}`)
    return workflowId
  }

  /**
   * 启动对标解析工作流
   */
  async startBenchmarkAnalysis(params: BenchmarkParams): Promise<string> {
    const client = await this.getClient()
    const workflowId = `${WORKFLOW_ID_PREFIX.BENCHMARK}-${params.benchmarkId}`

    await client.workflow.start('benchmarkAnalysisWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUE.BENCHMARK_ANALYSIS,
      args: [params],
      workflowExecutionTimeout: '10 minutes',
      retry: {
        initialInterval: '10 seconds',
        maximumInterval: '1 minute',
        backoffCoefficient: 2,
        maximumAttempts: 1,
      },
    })

    this.logger.log(
      `对标解析工作流已启动 benchmarkId=${params.benchmarkId} workflowId=${workflowId}`,
    )
    return workflowId
  }

  /**
   * 启动模板生成工作流（用户上传视频转模板）
   *
   * @param params 模板生成入参（templateId / userId / ossKey / title）
   * @returns 工作流 ID
   */
  async startTemplateGeneration(params: TemplateGenerationInput): Promise<string> {
    const client = await this.getClient()
    const workflowId = `${WORKFLOW_ID_PREFIX.TEMPLATE}-${params.templateId}`

    await client.workflow.start('templateGenerationWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUE.TEMPLATE_GENERATION,
      args: [params],
      // 视频分析 + LLM 汇总耗时较长，整体超时放宽到 15 分钟
      workflowExecutionTimeout: '15 minutes',
      retry: {
        initialInterval: '10 seconds',
        maximumInterval: '1 minute',
        backoffCoefficient: 2,
        // 工作流内部已处理失败路径（标记 ANALYSIS_FAILED），不重试整个工作流
        maximumAttempts: 1,
      },
    })

    this.logger.log(`模板生成工作流已启动 templateId=${params.templateId} workflowId=${workflowId}`)
    return workflowId
  }

  /**
   * 查询工作流状态
   */
  async getWorkflowStatus(workflowId: string) {
    const client = await this.getClient()
    const handle = client.workflow.getHandle(workflowId)
    return handle.describe()
  }

  /**
   * 判断确定性工作流 ID 是否已经被 Temporal 接受。
   * false 仅表示服务端明确返回 WorkflowNotFound；任何其他异常都保持不确定，
   * 由调用方保留预留而不是在网络错误后直接退款。
   */
  async isWorkflowStarted(workflowId: string): Promise<boolean> {
    try {
      await this.getWorkflowStatus(workflowId)
      return true
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) return false
      throw err
    }
  }

  /**
   * 取消工作流
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const client = await this.getClient()
    const handle = client.workflow.getHandle(workflowId)
    await handle.cancel()
    this.logger.log(`工作流已取消 workflowId=${workflowId}`)
  }

  /**
   * 等待工作流结果
   */
  async waitForResult<T>(workflowId: string): Promise<T | undefined> {
    const client = await this.getClient()
    const handle = client.workflow.getHandle(workflowId)
    return handle.result()
  }

  /**
   * 优雅关闭连接
   */
  async onClose(): Promise<void> {
    await closeClient()
    this.clientPromise = null
  }

  /**
   * C5: 启动 GenerationExecution Reconciler（单实例）
   *
   * 使用固定 workflowId 确保全局只有一个 reconciler 在运行。
   * 如果已存在运行中的 reconciler，操作会被 Temporal 幂等忽略。
   *
   * @param params 重建参数（扫描间隔 / 批次大小）
   * @returns 工作流 ID（固定值）
   */
  async startGenerationReconciler(params?: GenerationReconcilerParams): Promise<string> {
    const client = await this.getClient()
    const workflowId = WORKFLOW_ID_PREFIX.RECONCILER

    try {
      await client.workflow.start('generationReconcilerWorkflow', {
        workflowId,
        taskQueue: TASK_QUEUE.DEFAULT,
        args: [params ?? {}],
        // 长运行工作流：无执行超时
        workflowExecutionTimeout: '0',
        retry: {
          initialInterval: '10 seconds',
          maximumInterval: '5 minutes',
          backoffCoefficient: 2,
          maximumAttempts: 1,
        },
      })
      this.logger.log(`Reconciler 工作流已启动 workflowId=${workflowId}`)
    } catch (err: unknown) {
      // 已存在同 ID 的工作流 — 幂等，不报错
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('already exists') || msg.includes('AlreadyStarted')) {
        this.logger.debug(`Reconciler 已在运行中，跳过 workflowId=${workflowId}`)
      } else {
        throw err
      }
    }

    return workflowId
  }
}
