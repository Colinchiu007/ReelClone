/**
 * TemporalService - NestJS 可注入服务
 *
 * 封装 Temporal Client 操作，供业务服务（workbench / benchmark）注入使用。
 * 通过 @Injectable() 装饰，在 TemporalModule.forRoot() 时提供。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Client } from '@temporalio/client'
import { getClient, closeClient } from './client/temporal.client'
import { TASK_QUEUE, WORKFLOW_ID_PREFIX, type BenchmarkParams, type VideoGenParams } from './types'

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
  async startVideoGeneration(params: VideoGenParams): Promise<string> {
    const client = await this.getClient()
    const workflowId = `${WORKFLOW_ID_PREFIX.VIDEO_GEN}-${params.workId}`

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
   * 查询工作流状态
   */
  async getWorkflowStatus(workflowId: string) {
    const client = await this.getClient()
    const handle = client.workflow.getHandle(workflowId)
    return handle.describe()
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
}
