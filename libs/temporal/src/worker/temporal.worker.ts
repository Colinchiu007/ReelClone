/**
 * Temporal Worker 配置
 *
 * 注册所有工作流与 Activity，启动 Worker 监听任务队列。
 * 一个 Worker 实例可同时监听多个 Task Queue，并注册多组 Activity。
 *
 * 启动方式：
 *   - 开发环境：`npm run worker:start` 或 `ts-node libs/temporal/src/worker/temporal.worker.ts`
 *   - 生产环境：编译后 `node libs/temporal/dist/worker/temporal.worker.js`
 */
import { Worker, NativeConnection, type WorkerOptions } from '@temporalio/worker'
import path from 'path'
import { TASK_QUEUE } from '../types'
import { setActivityDependencies, type ActivityDependencies } from '../activities/activity-context'

// 导入 Activity 实现
import { seedanceActivities } from '../activities/seedance.activities'
import { billingActivities } from '../activities/billing.activities'
import { mediaActivities } from '../activities/media.activities'
import { analyzerActivities } from '../activities/analyzer.activities'
import { notificationActivities } from '../activities/notification.activities'
import { ossActivities } from '../activities/oss.activities'

/** 所有 Activity 实现集合 */
export const allActivities = {
  ...seedanceActivities,
  ...billingActivities,
  ...mediaActivities,
  ...analyzerActivities,
  ...notificationActivities,
  ...ossActivities,
}

/** Worker 配置选项 */
export interface TemporalWorkerConfig {
  /** Temporal Server 地址 */
  address?: string
  /** 命名空间 */
  namespace?: string
  /** Task Queue 名称 */
  taskQueue?: string
  /** 最大并发 Activity 数 */
  maxConcurrentActivityTaskExecutions?: number
  /** 最大并发工作流数 */
  maxConcurrentWorkflowTaskExecutions?: number
  /**
   * Activity 依赖集合（可选）
   *
   * 传入时，Worker 启动前会调用 setActivityDependencies 注入，
   * 供真实模式 Activity 通过 getActivityDependencies() 访问 NestJS Provider 实例。
   * 未传入时，需由调用方在 startWorker 之前手动调用 setActivityDependencies。
   */
  dependencies?: ActivityDependencies
}

/** Worker 单例 */
let workerInstance: Worker | null = null
/** NativeConnection 单例（与 Worker 生命周期绑定） */
let workerConnection: NativeConnection | null = null

/**
 * 创建并启动 Temporal Worker
 *
 * 注册所有工作流与 Activity，监听指定 Task Queue。
 * @param config 可选配置，默认从环境变量读取
 */
export async function startWorker(config?: TemporalWorkerConfig): Promise<Worker> {
  if (workerInstance) {
    console.warn('[Temporal Worker] Worker 已在运行')
    return workerInstance
  }

  // 注入 Activity 依赖（真实模式 Activity 通过 getActivityDependencies() 取用）
  if (config?.dependencies) {
    setActivityDependencies(config.dependencies)
    console.info('[Temporal Worker] 已注入 Activity 依赖')
  }

  const address = config?.address || process.env.TEMPORAL_ADDRESS || 'localhost:7233'
  const namespace = config?.namespace || process.env.TEMPORAL_NAMESPACE || 'reelclone'
  const taskQueue = config?.taskQueue || TASK_QUEUE.DEFAULT

  console.info('[Temporal Worker] 启动中', { address, namespace, taskQueue })

  // 建立 NativeConnection（Worker 必须使用 NativeConnection 连接 Temporal Server）
  workerConnection = await NativeConnection.connect({ address })

  const workerOptions: WorkerOptions = {
    // 指向工作流注册入口，Worker 会自动 bundle 此文件
    workflowsPath: path.join(__dirname, '..', 'workflows', 'index'),
    activities: allActivities,
    connection: workerConnection,
    taskQueue,
    namespace,
    maxConcurrentActivityTaskExecutions: config?.maxConcurrentActivityTaskExecutions ?? 10,
    maxConcurrentWorkflowTaskExecutions: config?.maxConcurrentWorkflowTaskExecutions ?? 20,
  }

  workerInstance = await Worker.create(workerOptions)

  // 优雅停机
  const shutdown = async () => {
    console.info('[Temporal Worker] 收到停机信号，开始优雅关闭...')
    if (workerInstance) {
      workerInstance.shutdown()
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.info('[Temporal Worker] 已启动，等待任务...')
  workerInstance
    .run()
    .then(() => {
      console.info('[Temporal Worker] 已正常退出')
      workerInstance = null
    })
    .catch((err) => {
      console.error('[Temporal Worker] 运行异常', err)
      workerInstance = null
      process.exit(1)
    })

  return workerInstance
}

/**
 * 停止 Worker（用于测试）
 */
export async function stopWorker(): Promise<void> {
  if (workerInstance) {
    workerInstance.shutdown()
    workerInstance = null
    console.info('[Temporal Worker] 已停止')
  }
  if (workerConnection) {
    await workerConnection.close()
    workerConnection = null
    console.info('[Temporal Worker] 连接已关闭')
  }
}

// ============================================================
// 直接执行入口：node 本文件即可启动 Worker
// ============================================================
if (require.main === module) {
  startWorker().catch((err) => {
    console.error('[Temporal Worker] 启动失败', err)
    process.exit(1)
  })
}

/** 导出默认工厂 */
export default {
  startWorker,
  stopWorker,
  allActivities,
}
