/**
 * 认证模块
 *
 * 装配：
 *  - DatabaseModule.forFeature([User], 'main')  注入 main 库的 User 仓储
 *  - PassportModule                              启用 Passport 默认策略
 *  - JwtModule.registerAsync                     注册 JWT（异步读取 jwtConfig）
 *  - 自定义 providers：AuthService / WechatService / JwtCustomService / JwtStrategy
 */
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import type { StringValue } from 'ms'
import {
  DatabaseModule,
  User,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { jwtConfig, type JwtConfig } from '@reelclone/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { WechatService } from './wechat.service'
import { JwtCustomService } from './jwt.service'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    DatabaseModule.forFeature([User], DATABASE_CONNECTIONS.MAIN),
    PassportModule,
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
  ],
  controllers: [AuthController],
  providers: [AuthService, WechatService, JwtCustomService, JwtStrategy],
  exports: [AuthService, JwtCustomService],
})
export class AuthModule {}
