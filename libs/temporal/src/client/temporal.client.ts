/**
 * Temporal Client 配置
 *
 * 提供 getClient() 单例方法，供业务服务（workbench/benchmark）启动工作流。
 * 配置项从环境变量读取：
 * - TEMPORAL_ADDRESS：Temporal Server 地址（默认 localhost:7233）
 * - TEMPORAL_NAMESPACE：命名空间（默认 reelclone）
 */
import { Connection, Client, type ConnectionOptions } from '@temporalio/client'
import { TASK_QUEUE, WORKFLOW_ID_PREFIX, type VideoGenParams } from '../types'
import { BENCHMARK_ANALYSIS_RETRY, VIDEO_GENERATION_RETRY } from '../retry-policies'

/** 默认命名空间 */
const DEFAULT_NAMESPACE = 'reelclone'

/** 默认 Temporal Server 地址 */
const DEFAULT_ADDRESS = 'localhost:7233'

/** 单例 Client */
let clientInstance: Client | null = null

/** 连接选项 */
export interface TemporalClientConfig {
  /** Temporal Server 地址（host:port） */
  address?: string
  /** 命名空间 */
  namespace?: string
  /** TLS 配置（生产环境启用） */
  tls?: ConnectionOptions['tls']
  /** gRPC 元数据（如鉴权 token） */
  metadata?: ConnectionOptions['metadata']
}

/**
 * 从环境变量读取配置
 */
function loadConfigFromEnv(): TemporalClientConfig {
  return {
    address: process.env.TEMPORAL_ADDRESS || DEFAULT_ADDRESS,
    namespace: process.env.TEMPORAL_NAMESPACE || DEFAULT_NAMESPACE,
    tls: process.env.TEMPORAL_TLS_ENABLED === 'true' ? {} : undefined,
  }
}

/**
 * 获取 Temporal Client 单例
 *
 * 首次调用时建立连接，后续复用。
 * @param config 可选配置，默认从环境变量读取
 */
export async function getClient(config?: TemporalClientConfig): Promise<Client> {
  if (clientInstance) {
    return clientInstance
  }

  const mergedConfig = { ...loadConfigFromEnv(), ...config }
  const { address, namespace, tls, metadata } = mergedConfig

  console.info('[Temporal] 建立连接', { address, namespace })

  const connection = await Connection.connect({ address, tls, metadata })
  clientInstance = new Client({ connection, namespace })

  console.info('[Temporal] 连接已建立')
  return clientInstance
}

/**
 * 关闭 Client 连接（用于测试或优雅停机）
 */
export async function closeClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.connection.close()
    clientInstance = null
    console.info('[Temporal] 连接已关闭')
  }
}

// ============================================================
// 工作流启动便捷方法
// ============================================================

/**
 * 启动视频生成工作流
 * @param params 视频生成参数
 * @returns 工作流 ID
 */
export async function startVideoGenerationWorkflow(params: VideoGenParams): Promise<string> {
  const client = await getClient()
  const workflowId = `${WORKFLOW_ID_PREFIX.VIDEO_GEN}-${params.workId}-${params.generationTaskId}`

  await client.workflow.start('videoGenerationWorkflow', {
    workflowId,
    taskQueue: TASK_QUEUE.VIDEO_GENERATION,
    args: [params],
    // 工作流整体超时：15 分钟（含轮询 10 分钟 + 后处理 5 分钟）
    workflowExecutionTimeout: '15 minutes',
    // 重试策略：基础设施故障自动恢复（maximumAttempts: 2），业务终态错误不重试
    retry: VIDEO_GENERATION_RETRY,
  })

  console.info('[Temporal] 视频生成工作流已启动', { workflowId, workId: params.workId })
  return workflowId
}

/**
 * 启动对标解析工作流
 * @param params 对标解析参数
 * @returns 工作流 ID
 */
export async function startBenchmarkAnalysisWorkflow(params: {
  benchmarkId: string
  userId: string
  sourceUrl: string
  platform: string
}): Promise<string> {
  const client = await getClient()
  const workflowId = `${WORKFLOW_ID_PREFIX.BENCHMARK}-${params.benchmarkId}`

  await client.workflow.start('benchmarkAnalysisWorkflow', {
    workflowId,
    taskQueue: TASK_QUEUE.BENCHMARK_ANALYSIS,
    args: [params],
    workflowExecutionTimeout: '10 minutes',
    retry: BENCHMARK_ANALYSIS_RETRY,
  })

  console.info('[Temporal] 对标解析工作流已启动', { workflowId, benchmarkId: params.benchmarkId })
  return workflowId
}

/**
 * 查询工作流状态
 */
export async function getWorkflowStatus(workflowId: string): Promise<{
  runId: string
  status: string
  startTime?: Date
  closeTime?: Date
}> {
  const client = await getClient()
  const handle = client.workflow.getHandle(workflowId)
  const describe = await handle.describe()
  return {
    runId: describe.runId,
    status: describe.status.name,
    startTime: describe.startTime,
    closeTime: describe.closeTime,
  }
}

/**
 * 取消工作流
 */
export async function cancelWorkflow(workflowId: string, reason?: string): Promise<void> {
  const client = await getClient()
  const handle = client.workflow.getHandle(workflowId)
  await handle.cancel()
  console.info('[Temporal] 工作流已取消', { workflowId, reason })
}

/** 导出默认 Client 工厂方法 */
export default {
  getClient,
  closeClient,
  startVideoGenerationWorkflow,
  startBenchmarkAnalysisWorkflow,
  getWorkflowStatus,
  cancelWorkflow,
}
