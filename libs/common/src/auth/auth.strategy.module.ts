/**
 * JWT Strategy 共享模块
 *
 * 为每个微服务提供即插即用的 JWT 鉴权能力。
 * 消除 10 个服务各自重复实现 jwt.strategy.ts 的问题。
 *
 * 使用方式：
 * ```typescript
 * @Module({
 *   imports: [AuthStrategyModule.forRoot({ redisToken: REDIS_CLIENT })],
 * })
 * export class AppModule {}
 * ```
 */
import { DynamicModule, Module, Provider } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { AccessTokenStrategy } from './access-token.strategy'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'

export interface AuthStrategyModuleOptions {
  /** Redis 注入 token（默认 REDIS_CLIENT） */
  redisToken?: string | symbol
  /** 是否检查 tokenVersion（默认 true） */
  checkTokenVersion?: boolean
  /** 是否检查 session family（默认 true） */
  checkSessionFamily?: boolean
}

@Module({})
export class AuthStrategyModule {
  static forRoot(options?: AuthStrategyModuleOptions): DynamicModule {
    const redisToken = options?.redisToken ?? 'REDIS_CLIENT'

    const strategyProvider: Provider = {
      provide: AccessTokenStrategy,
      useFactory: (redis: any) => {
        return new AccessTokenStrategy({
          redis,
          checkTokenVersion: options?.checkTokenVersion ?? true,
          checkSessionFamily: options?.checkSessionFamily ?? true,
        })
      },
      inject: [redisToken],
    }

    return {
      module: AuthStrategyModule,
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      providers: [strategyProvider, JwtAuthGuard],
      exports: [PassportModule, JwtAuthGuard, AccessTokenStrategy],
    }
  }
}
