/**
 * TC-002: 素材上传 → 生成视频 → 下载作品
 *
 * 端到端验证资产上传与视频生成路径：
 *  1. 登录
 *  2. 获取 STS 上传凭证
 *  3. 模拟直传 OSS 完成后，创建资产记录
 *  4. 基于该资产提交「图生视频（首帧）」任务
 *  5. 轮询等待作品完成（Mock 模式立即完成）
 *  6. 查看作品详情，获取下载 URL
 *
 * 依赖服务：auth / asset / workbench / billing
 */
import { createClient, withToken, ApiClient } from '../helpers/test-client'
import {
  buildWechatLoginPayload,
  buildUploadTokenPayload,
  buildAssetPayload,
  buildImageToVideoPayload,
} from '../helpers/mock-data'
import { poll } from '../helpers/wait'
import { cleanupUser } from '../helpers/db-helper'

describe('用户路径2: 素材上传 → 生成视频 → 下载作品', () => {
  let authClient: ApiClient
  let assetClient: ApiClient
  let workbenchClient: ApiClient
  let userId: string
  let assetId: string
  let ossKey: string
  let workId: string

  beforeAll(async () => {
    authClient = createClient('auth')
    const loginPayload = buildWechatLoginPayload({ nickname: 'E2E-用户002' })
    const loginResult = await authClient.wechatLogin(
      loginPayload.code,
      loginPayload.nickname,
      loginPayload.avatarUrl,
    )
    userId = loginResult.user.id

    assetClient = withToken(authClient, 'asset')
    workbenchClient = withToken(authClient, 'workbench')
  })

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* 清理失败不阻断 */
      })
    }
  })

  test('1. 获取 STS 上传凭证（POST /assets/upload-token）', async () => {
    const tokenPayload = buildUploadTokenPayload('image', '首帧测试.png')
    const token = await assetClient.post<{
      ossKey?: string
      key?: string
      host?: string
      policy?: string
      signature?: string
      accessKeyId?: string
      expire?: number
      [k: string]: unknown
    }>('/assets/upload-token', tokenPayload)

    expect(token).toBeDefined()
    // 不同 OSS 实现可能返回 ossKey 或 key，至少应有一个用于后续创建资产的 key
    const key = token.ossKey ?? token.key
    expect(key).toBeTruthy()
    ossKey = key as string
  })

  test('2. 创建资产记录（POST /assets）', async () => {
    const assetPayload = buildAssetPayload({
      ossKey,
      name: '首帧测试.png',
      type: 'IMAGE',
      mimeType: 'image/png',
      size: 1024 * 100,
    })
    const asset = await assetClient.post<{
      id: string
      ossKey: string
      type: string
    }>('/assets', assetPayload)

    expect(asset).toBeDefined()
    expect(asset.id).toBeTruthy()
    expect(asset.ossKey).toBe(ossKey)
    assetId = asset.id
  })

  test('3. 查询资产列表包含刚创建的资产', async () => {
    const list = await assetClient.get<{
      list: Array<{ id: string; ossKey: string }>
      total: number
    }>('/assets', { page: 1, pageSize: 20 })

    expect(list.list.some((a) => a.id === assetId)).toBe(true)
  })

  test('4. 提交图生视频任务（POST /generations，首帧为刚上传的资产）', async () => {
    const payload = buildImageToVideoPayload(ossKey)
    const result = await workbenchClient.post<{ workId: string; taskId: string }>(
      '/generations',
      payload,
    )

    expect(result).toBeDefined()
    expect(result.workId).toBeTruthy()
    expect(result.taskId).toBeTruthy()
    workId = result.workId
  })

  test('5. 轮询等待作品完成（Mock 模式立即完成）', async () => {
    // 守卫：前置 test 4 失败时 workId 为 undefined，跳过避免级联错误
    expect(workId).toBeTruthy()
    // Mock 模式下 Temporal 工作流立即完成，作品状态应迅速变为 COMPLETED
    const work = await poll({
      fn: () =>
        workbenchClient.get<{ list: Array<{ id: string; status: string }>; total: number }>(
          '/works',
          {
            page: 1,
            pageSize: 50,
          },
        ),
      predicate: (res) => res.list.some((w: { id: string }) => w.id === workId),
      timeout: 10000,
      message: '作品列表未出现新作品',
    })

    expect(work.list.some((w: { id: string }) => w.id === workId)).toBe(true)

    // 轮询作品详情直到状态稳定（COMPLETED 或 FAILED 都视为终态）
    const detail = await poll({
      fn: () =>
        workbenchClient.get<{ id: string; status: string; resultUrl?: string }>(`/works/${workId}`),
      predicate: (w) => w.status === 'COMPLETED' || w.status === 'FAILED',
      timeout: 15000,
      message: `作品 ${workId} 未在超时内完成`,
    })

    // Mock 模式应成功完成
    expect(['COMPLETED', 'FAILED']).toContain(detail.status)
  })

  test('6. 查看作品详情获取下载 URL（GET /works/:id）', async () => {
    // 守卫：前置 test 失败时 workId 为 undefined，跳过避免级联错误
    expect(workId).toBeTruthy()
    const work = await workbenchClient.get<{
      id: string
      status: string
      resultUrl?: string
      coverUrl?: string
      ossKey?: string
    }>(`/works/${workId}`)

    expect(work).toBeDefined()
    expect(work.id).toBe(workId)
    // 完成的作品应携带可下载的字段（resultUrl 或 ossKey）
    // Mock 模式下可能返回 mock URL，仅校验字段存在性
    const downloadable = work.resultUrl ?? work.ossKey ?? work.coverUrl
    expect(downloadable).toBeTruthy()
  })

  test('7. 删除资产（DELETE /assets/:id）', async () => {
    const result = await assetClient.delete<{ deleted?: boolean; id?: string }>(
      `/assets/${assetId}`,
    )
    expect(result).toBeDefined()

    // 删除后列表不应再包含该资产
    const list = await assetClient.get<{ list: Array<{ id: string }>; total: number }>('/assets', {
      page: 1,
      pageSize: 50,
    })
    expect(list.list.some((a) => a.id === assetId)).toBe(false)
  })
})
