/**
 * notification-service 根模块
 *
 * 组合：
 *  - ConfigModule         全局配置（环境变量）
 *  - DatabaseModule       4 个 PostgreSQL 连接（main 库持有 Notification 实体）
 *  - RedisModule          ioredis 客户端（Pub/Sub + 心跳缓存）
 *  - AuthModule           Passport + JWT（供全局 JwtAuthGuard 使用）
 *  - NotificationModule   业务模块（控制器 + 网关 + 订阅器 + 服务）
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { jwtConfig } from '@reelclone/common'
import { DatabaseModule, RedisModule } from '@reelclone/database'
import { AuthModule } from './auth/auth.module'
import { NotificationModule } from './notification/notification.module'

@Module({
  imports: [
    // -------------------- 配置 --------------------
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [jwtConfig],
      // 显式声明可被验证的字段（便于在容器中提前暴露缺失项）
      cache: true,
    }),

    // -------------------- 基础设施 --------------------
    DatabaseModule.forRoot(),
    RedisModule.forRoot(),

    // -------------------- 鉴权 --------------------
    AuthModule,

    // -------------------- 业务 --------------------
    NotificationModule,
  ],
})
export class AppModule {}
