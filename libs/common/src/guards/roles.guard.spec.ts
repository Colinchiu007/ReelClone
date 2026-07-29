/**
 * roles.guard 单元测试
 */
import { type ExecutionContext, ForbiddenException } from '@nestjs/common'
import { type Reflector } from '@nestjs/core'
import { RolesGuard } from './roles.guard'

// 使用 jest.fn 模拟 Reflector.getAllAndOverride
const getAllAndOverrideMock = jest.fn()
const mockReflector = { getAllAndOverride: getAllAndOverrideMock } as unknown as Reflector

/**
 * 构造 mock ExecutionContext
 * @param user 注入到 request.user 的对象，不传则 request.user 不存在
 */
function createMockContext(user?: { role?: string }): ExecutionContext {
  const request: { user?: { role?: string } } = {}
  if (user !== undefined) {
    request.user = user
  }
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
  let guard: RolesGuard

  beforeEach(() => {
    jest.clearAllMocks()
    guard = new RolesGuard(mockReflector)
  })

  describe('canActivate', () => {
    it('未设置 @Roles() 元数据时应放行', () => {
      getAllAndOverrideMock.mockReturnValue(undefined)
      expect(guard.canActivate(createMockContext({ role: 'USER' }))).toBe(true)
    })

    it('@Roles() 列表为空时应放行', () => {
      getAllAndOverrideMock.mockReturnValue([])
      expect(guard.canActivate(createMockContext({ role: 'USER' }))).toBe(true)
    })

    it('user.role 匹配时应通过', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN'])
      expect(guard.canActivate(createMockContext({ role: 'ADMIN' }))).toBe(true)
    })

    it('user.role 不匹配时应抛 ForbiddenException', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN'])
      expect(() => guard.canActivate(createMockContext({ role: 'USER' }))).toThrow(
        ForbiddenException,
      )
    })

    it('无 user 对象时应抛 ForbiddenException', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN'])
      expect(() => guard.canActivate(createMockContext(undefined))).toThrow(ForbiddenException)
    })

    it('user 无 role 字段时应抛 ForbiddenException', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN'])
      expect(() => guard.canActivate(createMockContext({}))).toThrow(ForbiddenException)
    })

    it('多角色匹配（@Roles("ADMIN", "SUPER_ADMIN")）时应通过', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN', 'SUPER_ADMIN'])
      expect(guard.canActivate(createMockContext({ role: 'SUPER_ADMIN' }))).toBe(true)
    })

    it('多角色匹配时另一角色也应通过', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN', 'SUPER_ADMIN'])
      expect(guard.canActivate(createMockContext({ role: 'ADMIN' }))).toBe(true)
    })

    it('抛出的 ForbiddenException 应携带"需要管理员权限"消息', () => {
      getAllAndOverrideMock.mockReturnValue(['ADMIN'])
      let caught: unknown
      try {
        guard.canActivate(createMockContext({ role: 'USER' }))
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(ForbiddenException)
      const response = (caught as ForbiddenException).getResponse() as { message: string }
      expect(response.message).toBe('需要管理员权限')
    })
  })
})
