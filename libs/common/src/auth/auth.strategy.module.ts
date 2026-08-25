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
 *
 * user-service 等需要检查用户状态的服务：
 * ```typescript
 * AuthStrategyModule.forRoot({
 *   userStatusCheck: true,
 *   imports: [UserModule],  // 导入提供 USER_STATUS_CHECKER 的模块
 * })
 * ```
 */
import { type DynamicModule, Module, Provider, type Type } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import type { Redis } from 'ioredis'
import {
  AccessTokenStrategy,
  USER_STATUS_CHECKER,
  type UserStatusChecker,
} from './access-token.strategy'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { REDIS_CLIENT } from '../guards/rate-limit.guard'

export interface AuthStrategyModuleOptions {
  /** Redis 注入 token（默认 common REDIS_CLIENT，由 RedisBridgeModule 桥接） */
  redisToken?: string | symbol
  /** 是否检查 tokenVersion（默认 true） */
  checkTokenVersion?: boolean
  /** 是否检查 session family（默认 true） */
  checkSessionFamily?: boolean
  /** 是否检查用户状态 FROZEN/DELETED（默认 false，仅 user-service 启用） */
  userStatusCheck?: boolean
  /** 额外导入的模块（如 UserModule，用于提供 USER_STATUS_CHECKER） */
  imports?: Array<DynamicModule | Type<unknown>>
}

@Module({})
export class AuthStrategyModule {
  static forRoot(options?: AuthStrategyModuleOptions): DynamicModule {
    const redisToken = options?.redisToken ?? REDIS_CLIENT
    const enableUserStatusCheck = options?.userStatusCheck ?? false

    // 当 userStatusCheck 启用时，额外注入 USER_STATUS_CHECKER
    const inject: (string | symbol)[] = [redisToken]
    if (enableUserStatusCheck) {
      inject.push(USER_STATUS_CHECKER)
    }

    const strategyProvider: Provider = {
      provide: AccessTokenStrategy,
      useFactory: (redis: Redis, ...args: unknown[]) => {
        const userStatusChecker: UserStatusChecker | undefined = enableUserStatusCheck
          ? (args[0] as UserStatusChecker | undefined)
          : undefined
        return new AccessTokenStrategy({
          redis,
          checkTokenVersion: options?.checkTokenVersion ?? true,
          checkSessionFamily: options?.checkSessionFamily ?? true,
          userStatusCheck: enableUserStatusCheck,
          userStatusChecker,
        })
      },
      inject,
    }

    return {
      module: AuthStrategyModule,
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), ...(options?.imports ?? [])],
      providers: [strategyProvider, JwtAuthGuard],
      exports: [PassportModule, JwtAuthGuard, AccessTokenStrategy],
    }
  }
}
