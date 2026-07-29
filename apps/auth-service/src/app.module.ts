/**
 * Auth Service 根模块
 *
 * 装配：
 *  - ConfigModule（全局，加载 configuration + jwtConfig）
 *  - DatabaseModule（4 连接）
 *  - RedisModule（黑名单 + 缓存）
 *  - AuthModule（业务模块）
 *
 * 全局注册：
 *  - APP_FILTER  → AllExceptionsFilter
 *  - APP_INTERCEPTOR → ResponseInterceptor
 *  - APP_PIPE    → ValidationPipe
 *  - APP_GUARD   → JwtAuthGuard（@Public() 装饰器跳过）
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import {
  DatabaseModule,
  RedisModule,
} from '@reelclone/database'
import {
  AllExceptionsFilter,
  ResponseInterceptor,
  JwtAuthGuard,
  configuration,
  jwtConfig,
  createValidationPipe,
} from '@reelclone/common'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration, jwtConfig],
    }),
    DatabaseModule.forRoot(),
    RedisModule.forRoot(),
    AuthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_PIPE, useValue: createValidationPipe() },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
