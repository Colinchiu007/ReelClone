/**
 * TC-001: 微信登录 → 浏览首页 → 提交生成 → 查看作品
 *
 * 端到端验证最核心的用户路径：
 *  1. 微信小程序登录（Mock 模式）→ 获取 JWT
 *  2. 用 JWT 获取当前用户信息（跨服务验证 JWT 互通）
 *  3. 提交文本生成任务（消耗积分 → 启动工作流 → 返回 workId）
 *  4. 查看作品列表，验证刚创建的作品可见
 *
 * 依赖服务：auth / user / workbench / billing
 */
import { createClient, withToken, ApiClient, ApiError } from '../helpers/test-client'
import { buildWechatLoginPayload, buildTextGenerationPayload } from '../helpers/mock-data'
import { poll } from '../helpers/wait'
import { cleanupUser } from '../helpers/db-helper'

describe('用户路径1: 登录 → 浏览 → 生成 → 查看', () => {
  let authClient: ApiClient
  let userClient: ApiClient
  let workbenchClient: ApiClient
  let loginResult: {
    accessToken: string
    refreshToken: string
    user: { id: string; openId: string; nickname: string; currentPoints: number }
    isNewUser: boolean
  }

  beforeAll(async () => {
    authClient = createClient('auth')
    const loginPayload = buildWechatLoginPayload({
      nickname: 'E2E-用户001',
    })
    loginResult = await authClient.wechatLogin(
      loginPayload.code,
      loginPayload.nickname,
      loginPayload.avatarUrl,
    )

    userClient = withToken(authClient, 'user')
    workbenchClient = withToken(authClient, 'workbench')
  })

  afterAll(async () => {
    if (loginResult?.user?.id) {
      await cleanupUser(loginResult.user.id).catch(() => {
        // 清理失败不阻断测试报告
      })
    }
  })

  test('1. 微信登录返回 accessToken / refreshToken / user', () => {
    expect(loginResult).toBeDefined()
    expect(loginResult.accessToken).toBeTruthy()
    expect(loginResult.refreshToken).toBeTruthy()
    expect(loginResult.user).toBeDefined()
    expect(loginResult.user.openId).toBeTruthy()
    expect(loginResult.user.id).toBeTruthy()
    expect(typeof loginResult.user.currentPoints).toBe('number')
    // Mock 模式下 openId 应为 mock_openid_ 前缀
    expect(loginResult.user.openId).toMatch(/^mock_openid_/)
  })

  test('2. 获取当前用户（GET /users/me，跨服务验证 JWT）', async () => {
    const me = await userClient.get<{
      id: string
      openId: string
      nickname: string
    }>('/users/me')

    expect(me).toBeDefined()
    expect(me.id).toBe(loginResult.user.id)
    expect(me.openId).toBe(loginResult.user.openId)
    expect(me.nickname).toBeTruthy()
  })

  test('3. 提交文本生成任务（POST /generations）', async () => {
    const payload = buildTextGenerationPayload()
    const result = await workbenchClient.post<{ workId: string; taskId: string }>(
      '/generations',
      payload,
    )

    expect(result).toBeDefined()
    expect(result.workId).toBeTruthy()
    expect(result.taskId).toBeTruthy()

    // 缓存到测试上下文，供后续用例使用
    ;(loginResult as { workId?: string }).workId = result.workId
  })

  test('4. 查看作品列表包含刚创建的作品', async () => {
    const workId = (loginResult as { workId?: string }).workId
    expect(workId).toBeTruthy()

    // 作品创建后可能需要短暂时间才在列表可见，轮询确认
    const list = await poll({
      fn: () =>
        workbenchClient.get<{ list: Array<{ id: string }>; total: number }>('/works', {
          page: 1,
          pageSize: 20,
        }),
      predicate: (res) => res.list.some((w) => w.id === workId),
      timeout: 10000,
      message: '作品列表中未找到刚创建的作品',
    })

    expect(list.list.length).toBeGreaterThan(0)
    expect(list.list.some((w) => w.id === workId)).toBe(true)
  })

  test('5. 查看作品详情（GET /works/:id）', async () => {
    const workId = (loginResult as { workId?: string }).workId
    const work = await workbenchClient.get<{ id: string; userId: string }>(`/works/${workId}`)

    expect(work).toBeDefined()
    expect(work.id).toBe(workId)
    expect(work.userId).toBe(loginResult.user.id)
  })

  test('6. 未授权访问应被拒绝（验证 JWT 守卫生效）', async () => {
    const anonClient = createClient('user')
    await expect(anonClient.get('/users/me')).rejects.toThrow(ApiError)
  })
})
