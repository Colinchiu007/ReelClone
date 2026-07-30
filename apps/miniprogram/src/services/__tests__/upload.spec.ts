/**
 * uploadFile 单元测试
 *
 * 覆盖场景：
 *  - 正常路径：获取 STS 凭证 → uploadFile success → 返回 { key, url }
 *  - 凭证获取失败：request.post 抛错（RequestManager 包装为网络错误）
 *  - 上传 HTTP 失败：uploadFile success 但 statusCode 非 2xx
 *  - 上传 fail 回调：uploadFile fail 触发
 *  - 上传 fail 回调无 errMsg 时使用默认错误消息
 *  - 进度回调：onProgressUpdate 被调用
 *  - url 拼接：uploadUrl 末尾有/无斜杠
 *  - fileName 派生：从 file.path 提取文件名
 *  - fileType 大写转换
 *  - 上传参数：filePath / formData / name 正确传递
 *
 * 时序说明：
 *  uploadFile 内部先 await request.post（微任务），然后同步调用 Taro.uploadFile。
 *  mockUploadFile 通过 setImmediate 在 Taro.uploadFile 返回后的下一个 tick 触发 success/fail，
 *  确保 success/fail 回调已注册。
 */
import Taro from '@tarojs/taro'
import { uploadFile } from '../upload'
import { __resetAll } from '../../../__mocks__/taro'
import type { UploadToken } from '@/types'

/** 构造一个 STS 凭证响应（通过 Taro.request 返回） */
function stsResponse(overrides: Partial<UploadToken> = {}): UploadToken {
  return {
    uploadUrl: 'https://oss.example.com/bucket',
    key: 'assets/abc-123.mp4',
    token: 'sts-token-xyz',
    expireAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    ...overrides,
  }
}

/** 构造 Taro.request 的成功响应（业务 code=0） */
function requestSuccessResponse<T>(data: T) {
  return { statusCode: 200, data: { code: 0, message: 'ok', data } }
}

/** Taro.uploadFile options 接口 */
interface UploadFileOptions {
  url: string
  filePath: string
  name: string
  formData?: Record<string, string>
  success?: (res: { statusCode: number; data?: string }) => void
  fail?: (err: { errMsg: string }) => void
}

/**
 * Mock Taro.uploadFile — 通过 setImmediate 在下一个 tick 触发 success/fail
 *
 * 用法：
 *   mockUploadFile({ success: { statusCode: 200 } })
 *   mockUploadFile({ fail: { errMsg: 'network error' } })
 *   mockUploadFile({ progressValues: [50, 100], success: { statusCode: 200 } })
 */
function mockUploadFile(
  config: {
    success?: { statusCode: number; data?: string }
    fail?: { errMsg: string }
    progressValues?: number[]
  } = {},
): { triggerProgress: (p: number) => void } {
  let progressCb: ((res: { progress: number }) => void) | null = null

  ;(Taro.uploadFile as jest.Mock).mockImplementation((opts: UploadFileOptions) => {
    const task = {
      onProgressUpdate: (cb: (res: { progress: number }) => void) => {
        progressCb = cb
        // 注册后同步触发预设的进度值
        if (config.progressValues) {
          for (const p of config.progressValues) {
            cb({ progress: p })
          }
        }
      },
    }
    // 在 task 返回后的下一个 tick 触发 success/fail（确保回调已注册）
    if (config.success) {
      setImmediate(() => opts.success?.(config.success!))
    } else if (config.fail) {
      setImmediate(() => opts.fail?.(config.fail!))
    }
    return task
  })

  return {
    triggerProgress: (progress: number) => progressCb?.({ progress }),
  }
}

describe('uploadFile', () => {
  beforeEach(() => {
    __resetAll()
  })

  describe('正常路径', () => {
    it('正常上传应返回 { key, url }', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ success: { statusCode: 200, data: 'ok' } })

      const result = await uploadFile({ path: '/tmp/video.mp4', size: 1024 }, 'video')

      expect(result).toEqual({
        key: 'assets/abc-123.mp4',
        url: 'https://oss.example.com/bucket/assets/abc-123.mp4',
      })
    })

    it('uploadUrl 末尾无斜杠时 url 应正确拼接', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(
        requestSuccessResponse(stsResponse({ uploadUrl: 'https://oss.example.com/bucket' })),
      )
      mockUploadFile({ success: { statusCode: 200 } })

      const result = await uploadFile({ path: '/tmp/v.mp4', size: 100 }, 'video')
      expect(result.url).toBe('https://oss.example.com/bucket/assets/abc-123.mp4')
    })

    it('uploadUrl 末尾有斜杠时 url 不应重复斜杠', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(
        requestSuccessResponse(stsResponse({ uploadUrl: 'https://oss.example.com/bucket/' })),
      )
      mockUploadFile({ success: { statusCode: 200 } })

      const result = await uploadFile({ path: '/tmp/v.mp4', size: 100 }, 'video')
      expect(result.url).toBe('https://oss.example.com/bucket/assets/abc-123.mp4')
      expect(result.url).not.toContain('//bucket/')
    })
  })

  describe('凭证获取失败', () => {
    it('Taro.request 抛错时应抛出 RequestError', async () => {
      // RequestManager 会捕获原始错误并包装为"网络异常，请检查网络连接"
      ;(Taro.request as jest.Mock).mockRejectedValue(new Error('network error'))

      await expect(uploadFile({ path: '/tmp/video.mp4', size: 1024 }, 'video')).rejects.toThrow(
        '网络异常',
      )

      // uploadFile 不应被调用
      expect(Taro.uploadFile).not.toHaveBeenCalled()
    })
  })

  describe('上传失败', () => {
    it('上传 HTTP 非 2xx 应抛错', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ success: { statusCode: 403, data: 'forbidden' } })

      await expect(uploadFile({ path: '/tmp/video.mp4', size: 1024 }, 'video')).rejects.toThrow(
        '上传失败 (HTTP 403)',
      )
    })

    it('上传 fail 回调应抛错', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ fail: { errMsg: 'uploadFile:fail network error' } })

      await expect(uploadFile({ path: '/tmp/video.mp4', size: 1024 }, 'video')).rejects.toThrow(
        'uploadFile:fail network error',
      )
    })

    it('上传 fail 回调无 errMsg 时使用默认错误消息', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ fail: { errMsg: '' } })

      await expect(uploadFile({ path: '/tmp/video.mp4', size: 1024 }, 'video')).rejects.toThrow(
        '文件上传失败',
      )
    })
  })

  describe('进度回调', () => {
    it('进度回调应被透传', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      const progressSpy = jest.fn()
      mockUploadFile({
        progressValues: [50, 100],
        success: { statusCode: 200 },
      })

      await uploadFile({ path: '/tmp/video.mp4', size: 1024 }, 'video', progressSpy)

      expect(progressSpy).toHaveBeenCalledWith(50)
      expect(progressSpy).toHaveBeenCalledWith(100)
      expect(progressSpy).toHaveBeenCalledTimes(2)
    })

    it('无 onProgress 回调时不应报错', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ progressValues: [50], success: { statusCode: 200 } })

      // 不传 onProgress 参数
      const result = await uploadFile({ path: '/tmp/v.mp4', size: 100 }, 'video')
      expect(result.key).toBe('assets/abc-123.mp4')
    })
  })

  describe('参数构造', () => {
    it('fileName 应从 file.path 派生', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ success: { statusCode: 200 } })

      await uploadFile({ path: '/tmp/my-video-file.mp4', size: 100 }, 'video')

      // Taro.request 第一次调用即为凭证请求
      const reqCall = (Taro.request as jest.Mock).mock.calls[0][0]
      expect(reqCall.data).toEqual({
        fileType: 'VIDEO',
        fileName: 'my-video-file.mp4',
      })
    })

    it('fileType 应转换为大写', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ success: { statusCode: 200 } })

      await uploadFile({ path: '/tmp/v.png', size: 100 }, 'image')

      const reqCall = (Taro.request as jest.Mock).mock.calls[0][0]
      expect(reqCall.data.fileType).toBe('IMAGE')
    })

    it('path 无文件名时应使用默认 fileName', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(stsResponse()))
      mockUploadFile({ success: { statusCode: 200 } })

      await uploadFile({ path: '', size: 100 }, 'image')

      const reqCall = (Taro.request as jest.Mock).mock.calls[0][0]
      // 空字符串 split('/').pop() 返回 ''，触发 fallback `upload-${Date.now()}`
      expect(reqCall.data.fileName).toMatch(/^upload-\d+$/)
    })

    it('上传时应传递 filePath 和 formData（key + token）', async () => {
      const token = stsResponse()
      ;(Taro.request as jest.Mock).mockResolvedValue(requestSuccessResponse(token))
      mockUploadFile({ success: { statusCode: 200 } })

      await uploadFile({ path: '/tmp/v.mp4', size: 100 }, 'video')

      const uploadCall = (Taro.uploadFile as jest.Mock).mock.calls[0][0]
      expect(uploadCall.url).toBe(token.uploadUrl)
      expect(uploadCall.filePath).toBe('/tmp/v.mp4')
      expect(uploadCall.name).toBe('file')
      expect(uploadCall.formData).toEqual({
        key: token.key,
        token: token.token,
      })
    })
  })
})
