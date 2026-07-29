/**
 * 用户模块
 *
 * 注册 User + SmsCode 实体（main 库连接）
 * 提供 UserService + SmsService
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, SmsCode, DATABASE_CONNECTIONS } from '@reelclone/database';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { SmsService } from './sms.service';

@Module({
  imports: [
    // 注册 main 库的 User + SmsCode 实体仓储
    TypeOrmModule.forFeature([User, SmsCode], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [UserController],
  providers: [UserService, SmsService],
  exports: [UserService, SmsService],
})
export class UserModule {}
