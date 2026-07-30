/**
 * @jest-environment jsdom
 *
 * useUpload Hook 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（uploading=false, progress=0）
 *  - upload 正常路径：uploadFile → 进度回调 → 返回 {key,url}
 *  - upload 异常路径：uploadFile 抛错 → uploading 复位
 *  - upload finally：成功或失败 uploading 都复位
 *  - uploadMultiple 并行：3 个文件全部完成
 *  - uploadMultiple 异常：一个失败全部 reject
 *  - 进度回调更新
 */
import { __resetAll } from '../../../__mocks__/taro'
import { renderHook, act } from '../../test/renderHook'
import { useUpload } from '../useUpload'

/** mock upload.ts 的 uploadFile */
jest.mock('@/services/upload', () => ({
  uploadFile: jest.fn(),
}))

import { uploadFile } from '@/services/upload'

/** 模拟 uploadFile 的成功返回 */
function mockUploadFileSuccess(
  results: Array<{ key: string; url: string }> | { key: string; url: string },
) {
  const arr = Array.isArray(results) ? results : [results]
  let callIndex = 0
  ;(uploadFile as jest.Mock).mockImplementation(
    async (
      _file: { path: string; size: number },
      _type: 'image' | 'video' | 'audio',
      onProgress?: (percent: number) => void,
    ) => {
      // 触发进度回调
      if (onProgress) {
        onProgress(10)
        onProgress(50)
        onProgress(100)
      }
      const result = arr[callIndex % arr.length]
      callIndex++
      return result
    },
  )
}

/** 模拟 uploadFile 抛错 */
function mockUploadFileError(error: Error) {
  ;(uploadFile as jest.Mock).mockRejectedValue(error)
}

/** 模拟 uploadFile 在不同调用时返回不同结果（成功/失败） */
function mockUploadFileSequence(
  implementations: Array<{ success?: { key: string; url: string }; error?: Error }>,
) {
  let callIndex = 0
  ;(uploadFile as jest.Mock).mockImplementation(
    async (
      _file: { path: string; size: number },
      _type: 'image' | 'video' | 'audio',
      onProgress?: (percent: number) => void,
    ) => {
      const setup = implementations[callIndex] || implementations[implementations.length - 1]
      callIndex++
      if (setup.error) {
        throw setup.error
      }
      if (onProgress) {
        onProgress(50)
      }
      return setup.success!
    },
  )
}

describe('useUpload', () => {
  beforeEach(() => {
    __resetAll()
    ;(uploadFile as jest.Mock).mockReset()
  })

  describe('初始状态', () => {
    it('uploading 应为 false', () => {
      const { result } = renderHook(() => useUpload())
      expect(result.current.uploading).toBe(false)
    })

    it('progress 应为 0', () => {
      const { result } = renderHook(() => useUpload())
      expect(result.current.progress).toBe(0)
    })

    it('应暴露 upload / uploadMultiple 方法', () => {
      const { result } = renderHook(() => useUpload())
      expect(typeof result.current.upload).toBe('function')
      expect(typeof result.current.uploadMultiple).toBe('function')
    })
  })

  describe('upload 单文件', () => {
    it('正常路径：返回 { key, url } 且 progress 走完', async () => {
      mockUploadFileSuccess({ key: 'assets/abc.mp4', url: 'https://oss.example.com/abc.mp4' })

      const { result } = renderHook(() => useUpload())

      let returned: { key: string; url: string } | undefined
      await act(async () => {
        returned = await result.current.upload({ path: '/tmp/v.mp4', size: 1024 }, 'video')
      })

      expect(returned).toEqual({ key: 'assets/abc.mp4', url: 'https://oss.example.com/abc.mp4' })
      expect(uploadFile).toHaveBeenCalledTimes(1)
      expect(uploadFile).toHaveBeenCalledWith(
        { path: '/tmp/v.mp4', size: 1024 },
        'video',
        expect.any(Function),
      )
      expect(result.current.uploading).toBe(false)
      expect(result.current.progress).toBe(100)
    })

    it('默认 type=image', async () => {
      mockUploadFileSuccess({ key: 'k', url: 'u' })

      const { result } = renderHook(() => useUpload())

      await act(async () => {
        await result.current.upload({ path: '/tmp/i.png', size: 100 })
      })

      expect(uploadFile).toHaveBeenCalledWith(
        { path: '/tmp/i.png', size: 100 },
        'image',
        expect.any(Function),
      )
    })

    it('成功后 uploading 应为 false', async () => {
      mockUploadFileSuccess({ key: 'k', url: 'u' })

      const { result } = renderHook(() => useUpload())

      await act(async () => {
        await result.current.upload({ path: '/tmp/v.mp4', size: 100 }, 'video')
      })

      expect(result.current.uploading).toBe(false)
    })

    it('uploadFile 抛错时 uploading 应复位且向上抛出', async () => {
      mockUploadFileError(new Error('上传失败'))

      const { result } = renderHook(() => useUpload())

      await act(async () => {
        await expect(
          result.current.upload({ path: '/tmp/v.mp4', size: 100 }, 'video'),
        ).rejects.toThrow('上传失败')
      })

      expect(result.current.uploading).toBe(false)
    })

    it('调用前 progress 重置为 0', async () => {
      mockUploadFileSuccess({ key: 'k', url: 'u' })

      const { result } = renderHook(() => useUpload())

      // 第一次上传
      await act(async () => {
        await result.current.upload({ path: '/tmp/v1.mp4', size: 100 }, 'video')
      })
      expect(result.current.progress).toBe(100)

      // 第二次上传前 progress 应重置为 0，再走完到 100
      await act(async () => {
        await result.current.upload({ path: '/tmp/v2.mp4', size: 100 }, 'video')
      })

      expect(result.current.progress).toBe(100)
    })

    it('进度回调应更新 progress 状态', async () => {
      let capturedProgress: ((p: number) => void) | undefined
      ;(uploadFile as jest.Mock).mockImplementation(
        async (
          _file: { path: string; size: number },
          _type: 'image' | 'video' | 'audio',
          onProgress?: (percent: number) => void,
        ) => {
          capturedProgress = onProgress
          return { key: 'k', url: 'u' }
        },
      )

      const { result } = renderHook(() => useUpload())

      let promise: Promise<unknown>
      act(() => {
        promise = result.current.upload({ path: '/tmp/v.mp4', size: 100 }, 'video')
      })

      // 上传中：uploading=true，progress 跟随回调
      expect(result.current.uploading).toBe(true)

      // 触发进度回调
      act(() => {
        capturedProgress?.(30)
      })
      expect(result.current.progress).toBe(30)

      act(() => {
        capturedProgress?.(70)
      })
      expect(result.current.progress).toBe(70)

      await act(async () => {
        await promise
      })

      // 完成后 progress=100
      expect(result.current.progress).toBe(100)
      expect(result.current.uploading).toBe(false)
    })
  })

  describe('uploadMultiple 多文件并行', () => {
    it('正常路径：3 个文件全部成功', async () => {
      mockUploadFileSuccess([
        { key: 'k1', url: 'u1' },
        { key: 'k2', url: 'u2' },
        { key: 'k3', url: 'u3' },
      ])

      const { result } = renderHook(() => useUpload())

      let returned: { key: string; url: string }[] | undefined
      await act(async () => {
        returned = await result.current.uploadMultiple(
          [
            { path: '/tmp/1.mp4', size: 100 },
            { path: '/tmp/2.mp4', size: 200 },
            { path: '/tmp/3.mp4', size: 300 },
          ],
          'video',
        )
      })

      expect(returned).toHaveLength(3)
      expect(returned![0]).toEqual({ key: 'k1', url: 'u1' })
      expect(returned![1]).toEqual({ key: 'k2', url: 'u2' })
      expect(returned![2]).toEqual({ key: 'k3', url: 'u3' })

      expect(uploadFile).toHaveBeenCalledTimes(3)
      expect(result.current.uploading).toBe(false)
      expect(result.current.progress).toBe(100)
    })

    it('默认 type=image', async () => {
      mockUploadFileSuccess({ key: 'k', url: 'u' })

      const { result } = renderHook(() => useUpload())

      await act(async () => {
        await result.current.uploadMultiple([{ path: '/tmp/1.png', size: 100 }])
      })

      expect(uploadFile).toHaveBeenCalledWith(
        { path: '/tmp/1.png', size: 100 },
        'image',
        expect.any(Function),
      )
    })

    it('空数组应直接返回空结果且 progress=100', async () => {
      mockUploadFileSuccess({ key: 'k', url: 'u' })

      const { result } = renderHook(() => useUpload())

      let returned: { key: string; url: string }[] | undefined
      await act(async () => {
        returned = await result.current.uploadMultiple([], 'image')
      })

      expect(returned).toEqual([])
      expect(uploadFile).not.toHaveBeenCalled()
      // total=0 时 completed/total=NaN → round(NaN)=NaN；但 setProgress(100) 兜底
      expect(result.current.progress).toBe(100)
      expect(result.current.uploading).toBe(false)
    })

    it('其中一个失败应整体 reject', async () => {
      mockUploadFileSequence([
        { success: { key: 'k1', url: 'u1' } },
        { error: new Error('第 2 个文件上传失败') },
        { success: { key: 'k3', url: 'u3' } },
      ])

      const { result } = renderHook(() => useUpload())

      await act(async () => {
        await expect(
          result.current.uploadMultiple(
            [
              { path: '/tmp/1.mp4', size: 100 },
              { path: '/tmp/2.mp4', size: 200 },
              { path: '/tmp/3.mp4', size: 300 },
            ],
            'video',
          ),
        ).rejects.toThrow('第 2 个文件上传失败')
      })

      expect(result.current.uploading).toBe(false)
    })

    it('多个文件上传时 progress 应按完成数累进', async () => {
      // 用 Promise 控制每个 uploadFile 的完成时机
      // mock 在 resolve 前调用 onProgress(100) 一次（模拟"完成"事件）
      const resolveFns: Array<() => void> = []
      ;(uploadFile as jest.Mock).mockImplementation(
        (
          _file: { path: string; size: number },
          _type: 'image' | 'video' | 'audio',
          onProgress?: (percent: number) => void,
        ) =>
          new Promise((resolve) => {
            resolveFns.push(() => {
              // 触发完成事件（onProgress 一次）
              if (onProgress) onProgress(100)
              resolve({ key: 'k', url: 'u' })
            })
          }),
      )

      const { result } = renderHook(() => useUpload())

      let promise: Promise<unknown>
      act(() => {
        promise = result.current.uploadMultiple(
          [
            { path: '/tmp/1.mp4', size: 100 },
            { path: '/tmp/2.mp4', size: 200 },
            { path: '/tmp/3.mp4', size: 300 },
            { path: '/tmp/4.mp4', size: 400 },
          ],
          'video',
        )
      })

      // 全部 in-flight 时 uploading=true，progress=0
      expect(result.current.uploading).toBe(true)
      expect(result.current.progress).toBe(0)

      // 完成 1 个 → progress=25
      await act(async () => {
        resolveFns[0]()
        // 让 Promise 微任务链推进
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(result.current.progress).toBe(25)

      // 完成 2 个 → progress=50
      await act(async () => {
        resolveFns[1]()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(result.current.progress).toBe(50)

      // 完成 3 个 → progress=75
      await act(async () => {
        resolveFns[2]()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(result.current.progress).toBe(75)

      // 全部完成 → progress=100
      await act(async () => {
        resolveFns[3]()
        await promise
      })
      expect(result.current.progress).toBe(100)
      expect(result.current.uploading).toBe(false)
    })
  })

  describe('Hook 稳定性', () => {
    it('多次渲染 upload/uploadMultiple 引用应稳定（useCallback 空依赖）', () => {
      const { result, rerender } = renderHook(() => useUpload())
      const upload1 = result.current.upload
      const uploadMultiple1 = result.current.uploadMultiple

      rerender()

      expect(result.current.upload).toBe(upload1)
      expect(result.current.uploadMultiple).toBe(uploadMultiple1)
    })
  })
})
