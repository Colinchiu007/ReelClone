/**
 * 认证模块
 *
 * 装配：
 *  - DatabaseModule.forFeature([User], 'main')  注入 main 库的 User 仓储
 *  - AuthStrategyModule                         共享 JWT 策略（checkSessionFamily: false，因为 auth-service 是签发方）
 *  - JwtModule.registerAsync                     注册 JWT（异步读取 jwtConfig）
 *  - WechatAdapterModule                         运行时绑定 Mock/Real WechatAdapter（fail closed）
 *  - 自定义 providers：AuthService / WechatService / JwtCustomService
 */
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import type { StringValue } from 'ms'
import { DatabaseModule, User, DATABASE_CONNECTIONS } from '@reelclone/database'
import { jwtConfig, type JwtConfig, AuthStrategyModule, REDIS_CLIENT } from '@reelclone/common'
import { WechatAdapterModule } from '@reelclone/adapters-wechat'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { WechatService } from './wechat.service'
import { JwtCustomService } from './jwt.service'

@Module({
  imports: [
    DatabaseModule.forFeature([User], DATABASE_CONNECTIONS.MAIN),
    AuthStrategyModule.forRoot({ redisToken: REDIS_CLIENT, checkSessionFamily: false }),
    JwtModule.registerAsync({
      inject: [jwtConfig.KEY],
      useFactory: (cfg: JwtConfig) => ({
        secret: cfg.secret,
        signOptions: {
          expiresIn: cfg.expiresIn as StringValue,
          issuer: cfg.issuer,
          audience: cfg.audience,
        },
      }),
    }),
    WechatAdapterModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, WechatService, JwtCustomService],
  exports: [AuthService, JwtCustomService],
})
export class AuthModule {}
