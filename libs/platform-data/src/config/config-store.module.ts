/**
 * ConfigStoreModule — 运行时配置存储模块
 *
 * 装配：
 *  - SystemConfig 实体仓储（main 库）
 *  - Redis 客户端（来自 RedisModule）
 *  - ConfigStoreService（实现 IConfigStore 接口）
 *
 * 通过 CONFIG_STORE_SERVICE Token 暴露 ConfigStoreService，
 * 消费方（如 SeedanceProvider）使用 @Optional() @Inject(CONFIG_STORE_SERVICE) 注入。
 *
 * 用法：
 *   @Module({
 *     imports: [ConfigStoreModule],
 *   })
 *   export class AppModule {}
 *
 * 依赖前置：
 *  - DatabaseModule.forRoot() 已注册（提供 main 连接）
 *  - RedisModule.forRoot() 已注册（提供 REDIS_CLIENT）
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SystemConfig, DATABASE_CONNECTIONS } from '@reelclone/database'
import { ConfigStoreService } from './config-store.service'
import { CONFIG_STORE_SERVICE } from '@reelclone/common'

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig], DATABASE_CONNECTIONS.MAIN)],
  providers: [
    ConfigStoreService,
    {
      // 通过 Token 暴露，便于消费方使用 @Inject(CONFIG_STORE_SERVICE)
      provide: CONFIG_STORE_SERVICE,
      useExisting: ConfigStoreService,
    },
  ],
  exports: [ConfigStoreService, CONFIG_STORE_SERVICE],
})
export class ConfigStoreModule {}
