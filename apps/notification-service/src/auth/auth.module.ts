/**
 * 鉴权模块
 *
 * 注册 JwtModule + AuthStrategyModule（共享 AccessTokenStrategy），
 * 供 AppModule 全局 JwtAuthGuard 使用。
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import type { StringValue } from 'ms'
import { resolveJwtSecret, AuthStrategyModule } from '@reelclone/common'

@Module({
  imports: [
    AuthStrategyModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? process.env.JWT_SECRET ?? resolveJwtSecret(),
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ??
            process.env.JWT_EXPIRES_IN ??
            '1h') as StringValue,
          issuer: config.get<string>('jwt.issuer') ?? process.env.JWT_ISSUER ?? 'reelclone',
          audience:
            config.get<string>('jwt.audience') ?? process.env.JWT_AUDIENCE ?? 'reelclone-client',
        },
      }),
    }),
  ],
  exports: [AuthStrategyModule, JwtModule],
})
export class AuthModule {}
