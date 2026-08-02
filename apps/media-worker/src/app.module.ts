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
 *  - GET /health 返回 { status: 'ok', worker: { running, taskQueue } }
 *  - Worker 不暴露业务 API，仅此端点供 K8s 探针使用
 *
 * 注：项目未引入 @nestjs/terminus，此处使用轻量 HealthController 即可满足探针需求。
 */
import { Controller, Get, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import { AiModule } from '@reelclone/ai'
import { ConfigStoreModule } from '@reelclone/common'
import { OSSModule } from '@reelclone/oss'
import { TemporalModule } from '@reelclone/temporal'
import { WorkerModule } from './worker/worker.module'
import { getWorkerStatus } from './worker/worker.bootstrap'

/**
 * 健康检查控制器
 *
 * 返回 Worker 运行状态，供 K8s liveness / readiness 探针使用。
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; worker: { running: boolean; taskQueue: string } } {
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
