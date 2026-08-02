/**
 * 统一 JWT Payload 结构
 *
 * 所有服务共享此接口，确保签发和校验使用相同的字段契约。
 */
export interface JwtPayload {
  /** 用户 ID（subject） */
  sub: string
  /** 微信 OpenID */
  openId: string
  /** Token 唯一 ID（用于黑名单） */
  jti: string
  /** Token 类型：access | refresh */
  type: 'access' | 'refresh'
  /** 用户角色（USER/ADMIN/SUPER_ADMIN） */
  role?: string
  /** Token 版本号（密码修改/冻结/注销时递增） */
  tokenVersion: number
  /** Session Family ID（登录时生成，刷新时轮换） */
  familyId: string
  /** 签发时间（秒） */
  iat?: number
  /** 过期时间（秒） */
  exp?: number
}
