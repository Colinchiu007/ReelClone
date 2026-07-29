/**
 * 认证控制器
 *
 * 路由前缀：/api/v1/auth（全局前缀 api/v1 + 控制器前缀 auth）
 *
 * 端点：
 *  - POST /api/v1/auth/admin-login    管理员登录（@Public）
 *  - POST /api/v1/auth/wechat-login   微信登录（@Public）
 *  - POST /api/v1/auth/refresh-token  刷新 Token（@Public）
 *  - POST /api/v1/auth/logout         登出（需 JWT 守卫）
 *  - GET  /api/v1/auth/health         健康检查（@Public，便于 Docker/K8s 探针）
 *
 * 响应会被全局 ResponseInterceptor 自动包装为：
 *   { code: 0, message: 'success', data: <返回值>, traceId }
 */
import { Body, Controller, Get, Post } from '@nestjs/common'
import { Public, CurrentUser, type CurrentUserPayload } from '@reelclone/common'
import { AuthService } from './auth.service'
import { WechatLoginDto } from './dto/wechat-login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { AdminLoginDto } from './dto/admin-login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 管理员登录（手机号 + 密码）
   *
   * 请求体：{ mobile: string, password: string }
   * 响应：{ accessToken, refreshToken, user: { id, nickname, role } }
   */
  @Public()
  @Post('admin-login')
  async adminLogin(@Body() dto: AdminLoginDto): ReturnType<AuthService['adminLogin']> {
    return this.authService.adminLogin(dto)
  }

  /**
   * 微信小程序登录
   *
   * 请求体：{ code: string, nickname?: string, avatarUrl?: string }
   * 响应：{ accessToken, refreshToken, user: {...}, isNewUser }
   */
  @Public()
  @Post('wechat-login')
  async wxLogin(@Body() dto: WechatLoginDto): ReturnType<AuthService['wxLogin']> {
    return this.authService.wxLogin(dto)
  }

  /**
   * 刷新 Token
   *
   * 请求体：{ refreshToken: string }
   * 响应：{ accessToken, refreshToken }
   */
  @Public()
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto): ReturnType<AuthService['refreshToken']> {
    return this.authService.refreshToken(dto.refreshToken)
  }

  /**
   * 登出（将当前 Token 加入黑名单）
   *
   * 需要 Authorization: Bearer <accessToken>
   * 响应：{ success: true }
   */
  @Post('logout')
  async logout(@CurrentUser() user: CurrentUserPayload): Promise<{ success: true }> {
    await this.authService.logout(user)
    return { success: true }
  }

  /**
   * 健康检查
   * 用于 Docker HEALTHCHECK / K8s liveness probe
   */
  @Public()
  @Get('health')
  health(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    }
  }
}
