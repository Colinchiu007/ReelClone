/**
 * 用户模块
 *
 * 注册 User + SmsCode 实体（main 库连接）
 * 提供 UserService + SmsService + JwtStrategy
 * JwtStrategy 放在此处是因为它依赖 UserRepository（同模块 forFeature 直接可见）
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User, SmsCode, DATABASE_CONNECTIONS } from '@reelclone/database'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { SmsService } from './sms.service'
import { JwtStrategy } from '../auth/jwt.strategy'

@Module({
  imports: [
    // 注册 main 库的 User + SmsCode 实体仓储
    TypeOrmModule.forFeature([User, SmsCode], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [UserController],
  providers: [UserService, SmsService, JwtStrategy],
  // 导出 TypeOrmModule 让 AppModule 中的 JwtStrategy 能注入 UserRepository
  exports: [UserService, SmsService, TypeOrmModule],
})
export class UserModule {}
