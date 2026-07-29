/**
 * billing-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - JwtModule：JWT 签名与校验
 *  - PassportModule：JWT 策略注册
 *  - BillingModule：业务模块
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 *  - InternalApiKeyGuard：@InternalApi() 标记的路由需 x-api-key
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  JwtAuthGuard,
  jwtConfig,
  configuration,
} from '@reelclone/common';
import {
  DatabaseModule,
  RedisModule,
} from '@reelclone/database';
import { BillingModule } from './billing/billing.module';
import { InternalApiKeyGuard } from './billing/guards/internal-api-key.guard';
import { JwtStrategy } from './billing/guards/jwt.strategy';

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
    // Passport + JWT
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? process.env.JWT_SECRET,
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn') ?? '1h',
          issuer: config.get<string>('jwt.issuer') ?? 'reelclone',
          audience: config.get<string>('jwt.audience') ?? 'reelclone-client',
        },
      }),
    }),
    // 业务模块
    BillingModule,
  ],
  providers: [
    JwtStrategy,
    // 全局守卫：JWT（默认）+ InternalApiKey（按需）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
  ],
})
export class AppModule {}
