/**
 * Media Worker 启动入口
 *
 * 启动流程：
 *   1. 启动 NestJS 应用（装配 DI 容器与各模块）
 *   2. 调用 bootstrapWorker 装配 Activity 并启动 Temporal Worker，监听任务队列
 *   3. 监听健康检查端口（默认 3010），仅暴露 /health 端点（无业务 API）
 *   4. 优雅退出：SIGTERM / SIGINT 时先停止 Worker 再关闭应用
 *
 * 该服务为长跑进程，由 Temporal Server 调度执行 Activity。
 */
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { bootstrapWorker, shutdownWorker } from './worker/worker.bootstrap'

async function bootstrap(): Promise<void> {
  const logger = new Logger('MediaWorker')

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  // -------------------- 启动 Temporal Worker --------------------
  // 装配所有 Activity（seedance/billing/media/analyzer/notification/oss），
  // 监听 reelclone-tasks 任务队列
  await bootstrapWorker(app)

  // -------------------- 健康检查端口 --------------------
  // Worker 不监听业务端口，仅暴露 /health 供 K8s 探针
  const config = app.get(ConfigService)
  const port = parseInt(config.get<string>('MEDIA_WORKER_PORT') || '3010', 10)
  await app.listen(port)

  logger.log(`media-worker health endpoint on http://localhost:${port}/health`)
  logger.log(`Temporal Worker 监听任务队列: ${config.get<string>('MEDIA_WORKER_TASK_QUEUE') || 'reelclone-tasks'}`)

  // -------------------- 优雅退出 --------------------
  // SIGTERM / SIGINT 时先停 Worker（保证正在执行的 Activity 正常收尾），再关闭应用
  let shuttingDown = false
  const gracefulShutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.log(`收到 ${signal} 信号，开始优雅关闭...`)
    try {
      await shutdownWorker()
      await app.close()
      logger.log('media-worker 已关闭')
    } catch (err) {
      logger.error(`优雅关闭时出错: ${(err as Error).message}`)
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
}

void bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ media-worker 启动失败:', err)
  process.exit(1)
})
