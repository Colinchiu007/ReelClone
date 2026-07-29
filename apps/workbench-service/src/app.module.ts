/**
 * workbench-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - TemporalModule.forRootAsync()：Temporal Client（Mock 模式可降级）
 *  - AiModule：AI 能力（Seedance / LLM / PromptEngine）
 *  - JwtModule：JWT 校验
 *  - PassportModule：JWT 策略注册
 *  - WorkbenchModule：业务模块
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import {
  JwtAuthGuard,
  jwtConfig,
  configuration,
  resolveJwtSecret,
  ConfigStoreModule,
} from '@reelclone/common'
import { DatabaseModule, RedisModule } from '@reelclone/database'
import { TemporalModule } from '@reelclone/temporal'
import { AiModule } from '@reelclone/ai'
import { WorkbenchModule } from './workbench/workbench.module'
import { JwtStrategy } from './auth/jwt.strategy'

@Module({
  imports: [
    // 环境变量
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, jwtConfig],
    }),
    // 数据库（4 个连接）
    DatabaseModule.forRoot(),
    // Redis
    RedisModule.forRoot(),
    // Temporal（从环境变量读取配置）
    TemporalModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        address: config.get<string>('TEMPORAL_ADDRESS') || 'localhost:7233',
        namespace: config.get<string>('TEMPORAL_NAMESPACE') || 'reelclone',
        mockMode: config.get<string>('TEMPORAL_MOCK_MODE') === 'true',
      }),
    }),
    // AI 能力
    AiModule,
    // 运行时配置存储（API Key 热刷新）
    ConfigStoreModule,
    // Passport + JWT
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (config.get<string>('jwt.secret') ??
          process.env.JWT_SECRET ??
          resolveJwtSecret()) as string,
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ?? '1h') as never,
          issuer: config.get<string>('jwt.issuer') ?? 'reelclone',
          audience: config.get<string>('jwt.audience') ?? 'reelclone-client',
        },
      }),
    }),
    // 业务模块
    WorkbenchModule,
  ],
  providers: [
    JwtStrategy,
    // 全局守卫：JWT（默认）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
