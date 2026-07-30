/**
 * 认证服务响应 DTO
 *
 * 将 auth.service.ts 中的 interface 响应类型改为 class，
 * 以便 @nestjs/swagger 能识别响应结构并生成 OpenAPI schema。
 *
 * 注意：这些 class 仅用于 Swagger 文档生成，业务逻辑仍在 AuthService 中，
 * 这里通过 class 装饰器暴露字段元数据。
 */
import { ApiProperty } from '@nestjs/swagger'
import { UserStatus, UserRole } from '@reelclone/database'

/** 登录响应中暴露的用户信息（脱敏） */
export class AuthUserResponseDto {
  @ApiProperty({ description: '用户 ID', example: 'uuid-xxx' })
  id: string

  @ApiProperty({ description: '微信 OpenID', example: 'o1234567890' })
  openId: string

  @ApiProperty({
    description: '微信 UnionID（未绑定则为 null）',
    example: 'u1234567890',
    nullable: true,
  })
  unionId: string | null

  @ApiProperty({ description: '用户昵称', example: '张三' })
  nickname: string

  @ApiProperty({
    description: '用户头像 URL',
    example: 'https://thirdwx.qlogo.cn/...',
    nullable: true,
  })
  avatarUrl: string | null

  @ApiProperty({
    description: '手机号（未绑定为 null）',
    example: '13800138000',
    nullable: true,
  })
  mobile: string | null

  @ApiProperty({
    description: '用户状态',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  status: UserStatus

  @ApiProperty({ description: '当前可用积分', example: 100 })
  currentPoints: number

  @ApiProperty({ description: '累计获得积分', example: 100 })
  totalPoints: number
}

/** 微信登录响应 */
export class WxLoginResultDto {
  @ApiProperty({ description: 'Access Token（短效，1 小时）', example: 'eyJ...' })
  accessToken: string

  @ApiProperty({ description: 'Refresh Token（长效，7 天）', example: 'eyJ...' })
  refreshToken: string

  @ApiProperty({ description: '用户信息（脱敏）', type: AuthUserResponseDto })
  user: AuthUserResponseDto

  @ApiProperty({ description: '是否为新用户（首次注册）', example: false })
  isNewUser: boolean
}

/** Token 刷新响应 */
export class RefreshTokenResultDto {
  @ApiProperty({ description: '新的 Access Token', example: 'eyJ...' })
  accessToken: string

  @ApiProperty({ description: '新的 Refresh Token', example: 'eyJ...' })
  refreshToken: string
}

/** 管理员登录响应中的用户信息 */
export class AdminUserInfoDto {
  @ApiProperty({ description: '用户 ID', example: 'uuid-xxx' })
  id: string

  @ApiProperty({ description: '用户昵称', example: 'admin' })
  nickname: string

  @ApiProperty({
    description: '用户角色',
    enum: UserRole,
    example: UserRole.ADMIN,
  })
  role: UserRole
}

/** 管理员登录响应 */
export class AdminLoginResultDto {
  @ApiProperty({ description: 'Access Token', example: 'eyJ...' })
  accessToken: string

  @ApiProperty({ description: 'Refresh Token', example: 'eyJ...' })
  refreshToken: string

  @ApiProperty({
    description: '管理员用户信息',
    type: () => AdminUserInfoDto,
  })
  user: AdminUserInfoDto
}

/** 登出响应 */
export class LogoutResultDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: true
}

/** 健康检查响应 */
export class HealthResultDto {
  @ApiProperty({ description: '状态', example: 'ok' })
  status: string

  @ApiProperty({ description: '服务名', example: 'auth-service' })
  service: string

  @ApiProperty({ description: '时间戳', example: '2026-07-30T00:00:00.000Z' })
  timestamp: string
}
