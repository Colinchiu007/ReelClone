/**
 * @jest-environment jsdom
 *
 * MediaUploader 组件单元测试
 *
 * 覆盖场景：
 *  - 初始渲染：空状态显示"添加图片/视频/音频"
 *  - 初始 value 有值时显示已上传项
 *  - type=image：点击添加 → chooseImage → uploadFile → onChange
 *  - type=video：点击添加 → chooseVideo → uploadFile（maxDuration 透传）
 *  - type=audio：点击添加 → chooseMessageFile → uploadFile
 *  - 上传中显示 spinner（uploading=true）
 *  - onUploadStart / onUploadEnd 回调时序
 *  - chooseImage 抛错 → uploading 复位 + onUploadEnd 调用
 *  - uploadFile 抛错 → uploading 复位 + onUploadEnd 调用
 *  - 删除文件：点击 × → onChange
 *  - 达到 maxCount 时不显示添加按钮
 *  - 外部 value 变化时同步内部 state
 */
import Taro from '@tarojs/taro'
import { __resetAll } from '../../../../__mocks__/taro'
import { render, fireClick, flushAsync, act } from '../../../test/render'
import MediaUploader from '../index'

/** mock @/services/upload 的 uploadFile */
jest.mock('@/services/upload', () => ({
  uploadFile: jest.fn(),
}))

import { uploadFile } from '@/services/upload'

/** 构造 chooseImage 成功响应 */
function chooseImageSuccess(
  overrides: Partial<{
    tempFilePaths: string[]
    tempFiles: Array<{ size: number }>
  }> = {},
) {
  return {
    tempFilePaths: ['/tmp/test.jpg'],
    tempFiles: [{ size: 1024 }],
    ...overrides,
  }
}

/** 构造 chooseVideo 成功响应 */
function chooseVideoSuccess(
  overrides: Partial<{
    tempFilePath: string
    size: number
    thumbTempFilePath?: string
  }> = {},
) {
  return {
    tempFilePath: '/tmp/test.mp4',
    size: 2048,
    duration: 30,
    width: 720,
    height: 1280,
    thumbTempFilePath: '/tmp/thumb.jpg',
    ...overrides,
  }
}

/** 构造 chooseMessageFile 成功响应 */
function chooseMessageFileSuccess(
  overrides: Partial<{
    tempFiles: Array<{ path: string; size: number; name: string }>
  }> = {},
) {
  return {
    tempFiles: [{ path: '/tmp/test.mp3', size: 5120, name: 'test.mp3' }],
    ...overrides,
  }
}

describe('MediaUploader', () => {
  beforeEach(() => {
    __resetAll()
    ;(uploadFile as jest.Mock).mockReset()
  })

  describe('初始渲染', () => {
    it('type=image 时显示"添加图片"', () => {
      const { queryByText } = render(<MediaUploader type="image" maxCount={3} />)
      expect(queryByText('添加图片')).not.toBeNull()
    })

    it('type=video 时显示"添加视频"', () => {
      const { queryByText } = render(<MediaUploader type="video" maxCount={3} />)
      expect(queryByText('添加视频')).not.toBeNull()
    })

    it('type=audio 时显示"添加音频"', () => {
      const { queryByText } = render(<MediaUploader type="audio" maxCount={3} />)
      expect(queryByText('添加音频')).not.toBeNull()
    })

    it('初始 value 有值时显示已上传项（不显示占位缩略图）', () => {
      const { queryByText, queryAllByClass } = render(
        <MediaUploader type="image" maxCount={3} value={['key-1', 'key-2']} />,
      )
      // 已有 2 项，应显示添加按钮（未达 maxCount=3）
      expect(queryByText('添加图片')).not.toBeNull()
      // 缩略图为 placeholder（无 thumbUrl）
      const placeholders = queryAllByClass('media-uploader__thumb--placeholder')
      expect(placeholders).toHaveLength(2)
    })

    it('达到 maxCount 时不显示添加按钮', () => {
      const { queryByText } = render(
        <MediaUploader type="image" maxCount={2} value={['key-1', 'key-2']} />,
      )
      expect(queryByText('添加图片')).toBeNull()
    })
  })

  describe('type=image 上传流程', () => {
    it('点击添加 → chooseImage → uploadFile → onChange', async () => {
      ;(Taro.chooseImage as jest.Mock).mockResolvedValue(chooseImageSuccess())
      ;(uploadFile as jest.Mock).mockResolvedValue({
        key: 'assets/new-key.jpg',
        url: 'https://oss.example.com/assets/new-key.jpg',
      })

      const onChange = jest.fn()
      const { queryByText } = render(
        <MediaUploader type="image" maxCount={3} onChange={onChange} />,
      )

      fireClick(queryByText('添加图片')!)
      await flushAsync()

      expect(Taro.chooseImage).toHaveBeenCalledWith({
        count: 1,
        sourceType: ['album', 'camera'],
      })
      expect(uploadFile).toHaveBeenCalledWith({ path: '/tmp/test.jpg', size: 1024 }, 'image')
      expect(onChange).toHaveBeenCalledWith(['assets/new-key.jpg'])
    })
  })

  describe('type=video 上传流程', () => {
    it('点击添加 → chooseVideo（含 maxDuration）→ uploadFile → onChange', async () => {
      ;(Taro.chooseVideo as jest.Mock).mockResolvedValue(chooseVideoSuccess())
      ;(uploadFile as jest.Mock).mockResolvedValue({
        key: 'assets/new-key.mp4',
        url: 'https://oss.example.com/assets/new-key.mp4',
      })

      const onChange = jest.fn()
      const { queryByText } = render(
        <MediaUploader type="video" maxCount={3} maxDuration={90} onChange={onChange} />,
      )

      fireClick(queryByText('添加视频')!)
      await flushAsync()

      expect(Taro.chooseVideo).toHaveBeenCalledWith({
        sourceType: ['album', 'camera'],
        maxDuration: 90,
        compressed: true,
      })
      expect(uploadFile).toHaveBeenCalledWith({ path: '/tmp/test.mp4', size: 2048 }, 'video')
      expect(onChange).toHaveBeenCalledWith(['assets/new-key.mp4'])
    })

    it('maxDuration 默认值为 60', () => {
      ;(Taro.chooseVideo as jest.Mock).mockResolvedValue(chooseVideoSuccess())
      ;(uploadFile as jest.Mock).mockResolvedValue({
        key: 'k',
        url: 'u',
      })

      const { queryByText } = render(<MediaUploader type="video" maxCount={3} />)

      fireClick(queryByText('添加视频')!)

      expect(Taro.chooseVideo).toHaveBeenCalledWith(expect.objectContaining({ maxDuration: 60 }))
    })
  })

  describe('type=audio 上传流程', () => {
    it('点击添加 → chooseMessageFile → uploadFile → onChange', async () => {
      ;(Taro.chooseMessageFile as jest.Mock).mockResolvedValue(chooseMessageFileSuccess())
      ;(uploadFile as jest.Mock).mockResolvedValue({
        key: 'assets/new-key.mp3',
        url: 'https://oss.example.com/assets/new-key.mp3',
      })

      const onChange = jest.fn()
      const { queryByText } = render(
        <MediaUploader type="audio" maxCount={3} onChange={onChange} />,
      )

      fireClick(queryByText('添加音频')!)
      await flushAsync()

      expect(Taro.chooseMessageFile).toHaveBeenCalledWith({
        count: 1,
        type: 'file',
        extension: ['mp3', 'wav', 'm4a', 'aac'],
      })
      expect(uploadFile).toHaveBeenCalledWith({ path: '/tmp/test.mp3', size: 5120 }, 'audio')
      expect(onChange).toHaveBeenCalledWith(['assets/new-key.mp3'])
    })
  })

  describe('上传状态与回调时序', () => {
    it('上传成功时 onUploadStart 先于 onUploadEnd 调用', async () => {
      ;(Taro.chooseImage as jest.Mock).mockResolvedValue(chooseImageSuccess())
      ;(uploadFile as jest.Mock).mockResolvedValue({ key: 'k', url: 'u' })

      const callOrder: string[] = []
      const onUploadStart = jest.fn(() => callOrder.push('start'))
      const onUploadEnd = jest.fn(() => callOrder.push('end'))

      const { queryByText } = render(
        <MediaUploader
          type="image"
          maxCount={3}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
        />,
      )

      fireClick(queryByText('添加图片')!)
      await flushAsync()

      expect(onUploadStart).toHaveBeenCalledTimes(1)
      expect(onUploadEnd).toHaveBeenCalledTimes(1)
      expect(callOrder).toEqual(['start', 'end'])
    })

    it('上传中显示 spinner（uploading=true）', async () => {
      // 用可控 Promise 捕获 uploading 中间状态
      ;(Taro.chooseImage as jest.Mock).mockResolvedValue(chooseImageSuccess())
      let resolveUpload!: (val: { key: string; url: string }) => void
      ;(uploadFile as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveUpload = resolve
        }),
      )

      const { queryByText, queryByClass } = render(<MediaUploader type="image" maxCount={3} />)

      fireClick(queryByText('添加图片')!)

      // 等待 chooseImage 完成 + setUploading(true)
      await flushAsync()

      // uploading 期间应显示 spinner，不显示"添加图片"
      expect(queryByClass('media-uploader__spinner')).not.toBeNull()
      expect(queryByText('添加图片')).toBeNull()

      // 完成 uploadFile
      await act(async () => {
        resolveUpload({ key: 'k', url: 'u' })
        await flushAsync()
      })

      // 上传完成后恢复"添加图片"
      expect(queryByText('添加图片')).not.toBeNull()
    })
  })

  describe('异常路径', () => {
    it('chooseImage 抛错 → uploading 保持 false + onUploadEnd 不调用', async () => {
      ;(Taro.chooseImage as jest.Mock).mockRejectedValue(new Error('用户取消'))
      ;(uploadFile as jest.Mock).mockResolvedValue({ key: 'k', url: 'u' })

      const onUploadStart = jest.fn()
      const onUploadEnd = jest.fn()
      const { queryByText } = render(
        <MediaUploader
          type="image"
          maxCount={3}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
        />,
      )

      fireClick(queryByText('添加图片')!)
      await flushAsync()

      // chooseImage 抛错在 setUploading(true) 之前，所以 onUploadStart/onUploadEnd 都不应被调用
      expect(onUploadStart).not.toHaveBeenCalled()
      expect(onUploadEnd).not.toHaveBeenCalled()
      // uploading 应为 false，显示"添加图片"
      expect(queryByText('添加图片')).not.toBeNull()
    })

    it('uploadFile 抛错 → uploading 复位 + onUploadEnd 调用', async () => {
      ;(Taro.chooseImage as jest.Mock).mockResolvedValue(chooseImageSuccess())
      ;(uploadFile as jest.Mock).mockRejectedValue(new Error('上传失败'))

      const onUploadStart = jest.fn()
      const onUploadEnd = jest.fn()
      const onChange = jest.fn()
      const { queryByText } = render(
        <MediaUploader
          type="image"
          maxCount={3}
          onChange={onChange}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
        />,
      )

      fireClick(queryByText('添加图片')!)
      await flushAsync()

      expect(onUploadStart).toHaveBeenCalledTimes(1)
      expect(onUploadEnd).toHaveBeenCalledTimes(1)
      // 上传失败不应调用 onChange
      expect(onChange).not.toHaveBeenCalled()
      // uploading 复位
      expect(queryByText('添加图片')).not.toBeNull()
    })
  })

  describe('删除文件', () => {
    it('点击 × 删除文件 → onChange 返回剩余 keys', () => {
      const onChange = jest.fn()
      const { queryAllByClass } = render(
        <MediaUploader type="image" maxCount={3} value={['key-1', 'key-2']} onChange={onChange} />,
      )

      // 点击第一个删除按钮
      const deleteBtns = queryAllByClass('media-uploader__delete')
      expect(deleteBtns).toHaveLength(2)
      fireClick(deleteBtns[0])

      expect(onChange).toHaveBeenCalledWith(['key-2'])
    })

    it('删除后项数减少', () => {
      const { queryAllByClass } = render(
        <MediaUploader type="image" maxCount={3} value={['key-1', 'key-2']} />,
      )
      expect(queryAllByClass('media-uploader__item')).toHaveLength(2)

      fireClick(queryAllByClass('media-uploader__delete')[0])

      expect(queryAllByClass('media-uploader__item')).toHaveLength(1)
    })
  })

  describe('外部 value 同步', () => {
    it('外部 value 变化时同步内部 state', () => {
      const { rerender, queryAllByClass } = render(
        <MediaUploader type="image" maxCount={5} value={['key-1']} />,
      )

      expect(queryAllByClass('media-uploader__item')).toHaveLength(1)

      rerender(<MediaUploader type="image" maxCount={5} value={['key-1', 'key-2', 'key-3']} />)

      expect(queryAllByClass('media-uploader__item')).toHaveLength(3)
    })
  })
})
