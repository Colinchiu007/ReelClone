/**
 * benchmark-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - PassportModule + JwtModule：JWT 鉴权基础设施
 *  - BenchmarkModule：对标解析业务模块
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  JwtAuthGuard,
  configuration,
  jwtConfig,
  resolveJwtSecret,
} from '@reelclone/common';
import {
  DatabaseModule,
  RedisModule,
} from '@reelclone/database';
import { BenchmarkModule } from './benchmark/benchmark.module';
import { JwtStrategy } from './auth/jwt.strategy';

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
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('jwt.secret') ??
          process.env.JWT_SECRET ??
          resolveJwtSecret(),
        signOptions: {
          // 环境变量为 string，ms.StringValue 是模板字面量类型，需断言
          expiresIn: (config.get<string>('jwt.expiresIn') ??
            process.env.JWT_EXPIRES_IN ??
            '1h') as any,
          issuer:
            config.get<string>('jwt.issuer') ??
            process.env.JWT_ISSUER ??
            'reelclone',
          audience:
            config.get<string>('jwt.audience') ??
            process.env.JWT_AUDIENCE ??
            'reelclone-client',
        },
      }),
    }),
    // 业务模块
    BenchmarkModule,
  ],
  providers: [
    JwtStrategy,
    // 全局守卫：JWT
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
