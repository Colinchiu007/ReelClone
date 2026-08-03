/**
 * Media Worker 根模块
 *
 * 装配：
 *  - ConfigModule（全局，加载 configuration）
 *  - DatabaseModule（4 连接，供 Activity 真实模式下写库）
 *  - RedisModule（实时事件推送 / 缓存）
 *  - AiModule（Seedance / FFmpeg / 视频分析 / 内容审核 / LLM Provider）
 *  - OSSModule（对象存储上传 / 签名 URL）
 *  - TemporalModule（Temporal Client，供 Worker 配置读取）
 *  - WorkerModule（Worker 子模块）
 *
 * 健康检查：
 *  - GET /livez → liveness 探针，始终 200
 *  - GET /readyz → readiness 探针，Worker 未启动返回 503
 *  - GET /health → legacy 兼容，返回完整状态
 *
 * 注：项目未引入 @nestjs/terminus，此处使用轻量 HealthController 即可满足探针需求。
 */
import { Controller, Get, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import { AiModule } from '@reelclone/ai'
import { ConfigStoreModule } from '@reelclone/platform-data'
import { OSSModule } from '@reelclone/oss'
import { TemporalModule } from '@reelclone/temporal'
import { WorkerModule } from './worker/worker.module'
import { getWorkerStatus } from './worker/worker.bootstrap'

/**
 * 健康检查控制器
 *
 * 提供三个端点供不同场景使用：
 * - GET /livez — liveness 探针，始终 200，仅确认进程存活
 * - GET /readyz — readiness 探针，检查 Worker 运行状态；down 返回 503
 * - GET /health — legacy 兼容，返回完整状态（保留给旧客户端）
 */
@Controller()
export class HealthController {
  /** liveness：进程存活即可 */
  @Get('livez')
  livez(): { status: string } {
    return { status: 'ok' }
  }

  /** readiness：Worker 已启动才就绪 */
  @Get('readyz')
  readyz(): { status: string; worker: { running: boolean; taskQueue: string } } {
    const worker = getWorkerStatus()
    if (!worker.running) {
      return {
        status: 'down',
        worker: { running: false, taskQueue: worker.taskQueue },
      }
    }
    return {
      status: 'ok',
      worker: { running: true, taskQueue: worker.taskQueue },
    }
  }

  /** legacy 兼容端点，返回完整状态 */
  @Get('health')
  health(): { status: string; worker: { running: boolean; taskQueue: string } } {
    const worker = getWorkerStatus()
    return {
      status: 'ok',
      worker: {
        running: worker.running,
        taskQueue: worker.taskQueue,
      },
    }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    RedisModule.forRoot(),
    AiModule,
    ConfigStoreModule,
    OSSModule.forRoot(),
    TemporalModule.forRoot(),
    WorkerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
