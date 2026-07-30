/**
 * template-service 根模块
 *
 * 导入:
 *  - ConfigModule: 环境变量配置
 *  - DatabaseModule: 4 个数据库连接（main / billing / template / benchmark）
 *  - PassportModule + JwtModule: JWT 鉴权基础设施
 *  - TemplateModule: 模板浏览/收藏/行业偏好业务模块
 *
 * 全局注册 JwtAuthGuard（通过 APP_GUARD），公开接口使用 @Public() 装饰器跳过鉴权。
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { APP_GUARD } from '@nestjs/core'
import type { StringValue } from 'ms'
import { DatabaseModule } from '@reelclone/database'
import { JwtAuthGuard, resolveJwtSecret } from '@reelclone/common'
import { TemplateModule } from './template/template.module'
import { JwtStrategy } from './auth/jwt.strategy'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule.forRoot(),
    PassportModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as StringValue },
    }),
    TemplateModule,
  ],
  providers: [JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
