/**
 * 用户模块
 *
 * 注册 User + SmsCode 实体（main 库连接）
 * 提供 UserService + SmsService + USER_STATUS_CHECKER
 *
 * USER_STATUS_CHECKER 由本模块提供，供 AuthStrategyModule 注入：
 * 在 JWT 鉴权时检查用户状态（FROZEN/DELETED），拒绝已冻结/已注销的用户。
 *
 * SMS_ADAPTER 由 SmsModule 根据 SMS_PROVIDER 环境变量绑定（aliyun/tencent/mock），
 * production/staging 缺凭证时 fail closed 阻止启动。
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, UserStatus, SmsCode, Template, DATABASE_CONNECTIONS } from '@reelclone/database'
import { SmsModule } from '@reelclone/adapters-sms'
import { USER_STATUS_CHECKER, BusinessException, ErrorCode } from '@reelclone/common'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { SmsService } from './sms.service'

@Module({
  imports: [
    // 注册 main 库的 User + SmsCode 实体仓储
    TypeOrmModule.forFeature([User, SmsCode], DATABASE_CONNECTIONS.MAIN),
    // 注册 template 库的 Template 实体仓储（用于公开主页聚合查询模板统计）
    TypeOrmModule.forFeature([Template], DATABASE_CONNECTIONS.TEMPLATE),
    // SMS 适配器模块：按 SMS_PROVIDER 绑定 Aliyun/Tencent/Mock 实现（fail closed）
    SmsModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    SmsService,
    // 用户状态检查器：供 AuthStrategyModule 在 JWT 鉴权时调用
    {
      provide: USER_STATUS_CHECKER,
      useFactory: (userRepository: Repository<User>) => ({
        check: async (userId: string) => {
          const user = await userRepository.findOne({
            where: { id: userId },
            select: ['id', 'status'],
          })
          if (!user) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, '用户不存在', undefined, 401)
          }
          if (user.status === UserStatus.FROZEN) {
            throw new BusinessException(ErrorCode.FORBIDDEN, '账号已被冻结', undefined, 403)
          }
          if (user.status === UserStatus.DELETED) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号已注销', undefined, 401)
          }
        },
      }),
      inject: [getRepositoryToken(User, DATABASE_CONNECTIONS.MAIN)],
    },
  ],
  // 导出 USER_STATUS_CHECKER 供 AppModule 中的 AuthStrategyModule 注入
  exports: [UserService, SmsService, TypeOrmModule, USER_STATUS_CHECKER],
})
export class UserModule {}
