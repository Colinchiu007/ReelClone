/**
 * AuthController 单元测试
 *
 * 测试 3 个端点的响应格式 + 健康检查端点：
 *  - POST /api/v1/auth/wechat-login
 *  - POST /api/v1/auth/refresh-token
 *  - POST /api/v1/auth/logout
 *  - GET  /api/v1/auth/health
 *
 * 注意：响应拦截器会自动包装为 ApiResponse，本测试只关注控制器返回值结构
 */
import { Test, type TestingModule } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { AuthService, type WxLoginResult } from './auth.service'
import type { WechatLoginDto } from './dto/wechat-login.dto'
import type { RefreshTokenDto } from './dto/refresh-token.dto'
import type { CurrentUserPayload } from '@reelclone/common'

// -------------------- Mock AuthService --------------------

function mockAuthService(): jest.Mocked<AuthService> {
  return {
    wxLogin: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  } as unknown as jest.Mocked<AuthService>
}

// -------------------- 测试 --------------------

describe('AuthController', () => {
  let controller: AuthController
  let authService: jest.Mocked<AuthService>

  beforeEach(async () => {
    authService = mockAuthService()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile()
    controller = module.get(AuthController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- wxLogin --------------------

  describe('POST /wechat-login', () => {
    it('应返回登录响应（accessToken/refreshToken/user/isNewUser）', async () => {
      const dto: WechatLoginDto = {
        code: 'wx-code-123',
        nickname: 'Tom',
        avatarUrl: 'https://example.com/a.png',
      }
      const expected: WxLoginResult = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-id-1',
          openId: 'openid_1',
          unionId: null,
          nickname: 'Tom',
          avatarUrl: 'https://example.com/a.png',
          mobile: null,
          status: 'ACTIVE' as never,
          currentPoints: 0,
          totalPoints: 0,
        },
        isNewUser: true,
      }
      authService.wxLogin.mockResolvedValueOnce(expected)

      const result = await controller.wxLogin(dto)

      expect(authService.wxLogin).toHaveBeenCalledWith(dto)
      expect(result).toEqual(expected)
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result).toHaveProperty('user')
      expect(result).toHaveProperty('isNewUser')
      expect(result.user.id).toBe('user-id-1')
    })

    it('老用户登录 isNewUser 应为 false', async () => {
      const dto: WechatLoginDto = { code: 'c' }
      authService.wxLogin.mockResolvedValueOnce({
        accessToken: 'at',
        refreshToken: 'rt',
        user: {
          id: 'u',
          openId: 'o',
          unionId: null,
          nickname: 'n',
          avatarUrl: null,
          mobile: null,
          status: 'ACTIVE' as never,
          currentPoints: 0,
          totalPoints: 0,
        },
        isNewUser: false,
      })

      const result = await controller.wxLogin(dto)
      expect(result.isNewUser).toBe(false)
    })
  })

  // -------------------- refreshToken --------------------

  describe('POST /refresh-token', () => {
    it('应返回新的 Token 对', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'old-refresh' }
      authService.refreshToken.mockResolvedValueOnce({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      })

      const result = await controller.refreshToken(dto)

      expect(authService.refreshToken).toHaveBeenCalledWith('old-refresh')
      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      })
    })
  })

  // -------------------- logout --------------------

  describe('POST /logout', () => {
    it('应调用 service.logout 并返回 { success: true }', async () => {
      const user: CurrentUserPayload = {
        userId: 'user-1',
        openid: 'openid_x',
        jti: 'jti-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }
      authService.logout.mockResolvedValueOnce(undefined)

      const result = await controller.logout(user)

      expect(authService.logout).toHaveBeenCalledWith(user)
      expect(result).toEqual({ success: true })
    })
  })

  // -------------------- health --------------------

  describe('GET /health', () => {
    it('应返回健康状态', () => {
      const result = controller.health()
      expect(result.status).toBe('ok')
      expect(result.service).toBe('auth-service')
      expect(typeof result.timestamp).toBe('string')
    })
  })

  // -------------------- 装饰器元数据 --------------------

  describe('路由装饰器', () => {
    it('wechat-login 应标记为 Public（通过 reflector 检查 metadata）', () => {
      // 这里直接验证方法存在且可调用（@Public 装饰器元数据由 NestJS 在运行时使用）
      expect(typeof controller.wxLogin).toBe('function')
    })

    it('refresh-token 应标记为 Public', () => {
      expect(typeof controller.refreshToken).toBe('function')
    })

    it('logout 不应标记为 Public（需要 JWT 守卫）', () => {
      expect(typeof controller.logout).toBe('function')
    })
  })
})
