/**
 * Worker 启动逻辑
 *
 * 负责：
 *   1. 从 ConfigService 读取 Temporal 连接配置
 *   2. 通过 Activity 容器装配所有 Activity
 *   3. 调用 startWorker 启动 Temporal Worker，监听任务队列
 *   4. 维护 Worker 运行状态（供 /health 端点读取）
 *   5. 提供优雅停机方法（先停 Worker 再关应用）
 *
 * 任务队列名默认 `reelclone-tasks`，与 Temporal Workflow 启动时的 taskQueue 保持一致。
 */
import { type INestApplication, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { startWorker, stopWorker } from '@reelclone/temporal'
import { buildActivities } from './activities.container'

/** 默认任务队列名 */
const DEFAULT_TASK_QUEUE = 'reelclone-tasks'

/** Worker 运行状态 */
let workerRunning = false
/** 当前监听的任务队列名 */
let currentTaskQueue = DEFAULT_TASK_QUEUE

/** Worker 健康状态 */
export interface WorkerStatus {
  running: boolean
  taskQueue: string
}

/**
 * 获取 Worker 运行状态（供 /health 端点读取）
 */
export function getWorkerStatus(): WorkerStatus {
  return {
    running: workerRunning,
    taskQueue: currentTaskQueue,
  }
}

/**
 * 启动 Temporal Worker
 *
 * 从 ConfigService 读取连接配置，装配 Activity，监听任务队列。
 * Mock 模式下（TEMPORAL_MOCK_MODE=true）Activity 走 Mock 路径，Worker 仍正常启动。
 *
 * @param app NestJS 应用实例
 */
export async function bootstrapWorker(app: INestApplication): Promise<void> {
  const logger = new Logger('MediaWorker')
  const config = app.get(ConfigService)

  const address = config.get<string>('TEMPORAL_ADDRESS') || 'localhost:7233'
  const namespace = config.get<string>('TEMPORAL_NAMESPACE') || 'reelclone'
  currentTaskQueue = config.get<string>('MEDIA_WORKER_TASK_QUEUE') || DEFAULT_TASK_QUEUE

  // 装配所有 Activity（当前由 libs/temporal 内置实现，Mock 模式下走 Mock 路径）
  const activities = buildActivities()
  logger.log(`已装配 Activity 数量: ${Object.keys(activities).length}`)

  logger.log(
    `启动 Temporal Worker address=${address} namespace=${namespace} taskQueue=${currentTaskQueue}`,
  )

  // startWorker 内部使用 libs/temporal 的 allActivities（与 buildActivities 同源），
  // 注册 workflowsPath 与 activities，开始监听任务队列
  await startWorker({
    address,
    namespace,
    taskQueue: currentTaskQueue,
  })

  workerRunning = true
  logger.log('Temporal Worker 已启动，等待任务...')
}

/**
 * 停止 Temporal Worker（优雅停机）
 *
 * 先停 Worker 再由调用方关闭 NestJS 应用，确保正在执行的 Activity 正常收尾。
 */
export async function shutdownWorker(): Promise<void> {
  const logger = new Logger('MediaWorker')
  if (workerRunning) {
    logger.log('正在停止 Temporal Worker...')
    await stopWorker()
    workerRunning = false
    logger.log('Temporal Worker 已停止')
  }
}
