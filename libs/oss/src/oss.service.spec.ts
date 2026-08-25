/**
 * OSSService 单元测试
 *
 * 覆盖：
 *  - Mock 模式：upload/download/delete/deleteMany/exists/getSignedUrl/getMetadata 返回模拟数据
 *  - 真实模式：ali-oss 客户端方法（put/get/delete/deleteMulti/head/signatureUrl）调用与结果映射
 *  - buildPublicUrl：默认 region 拼接与自定义 endpoint 覆盖
 */
import { OSSService } from './oss.service'
import type { OSSConfig } from './types'

// -------------------- mock ali-oss 客户端 --------------------

const mockPut = jest.fn()
const mockGet = jest.fn()
const mockDelete = jest.fn()
const mockDeleteMulti = jest.fn()
const mockHead = jest.fn()
const mockSignatureUrl = jest.fn()

jest.mock('ali-oss', () => {
  return jest.fn().mockImplementation(() => ({
    put: (...args: unknown[]) => mockPut(...args),
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    deleteMulti: (...args: unknown[]) => mockDeleteMulti(...args),
    head: (...args: unknown[]) => mockHead(...args),
    signatureUrl: (...args: unknown[]) => mockSignatureUrl(...args),
  }))
})

// -------------------- 测试基座 --------------------

const baseConfig: OSSConfig = {
  region: 'oss-cn-hangzhou',
  accessKeyId: 'test-access-key-id',
  accessKeySecret: 'test-access-key-secret',
  bucket: 'reelclone-test',
}

/** 直接构造实例并替换 logger（避免测试输出干扰） */
function instantiate(overrides: Partial<OSSConfig> = {}): OSSService {
  const service = Object.create(OSSService.prototype) as OSSService
  const config = { ...baseConfig, ...overrides }
  ;(service as { config: OSSConfig }).config = config
  ;(service as { logger: unknown }).logger = { warn: jest.fn(), error: jest.fn() }
  if (config.mock) {
    ;(service as { client: null }).client = null
  } else {
    // 复用被 mock 的 ali-oss 构造函数构造真实模式客户端，
    // 否则 !this.client 恒真会误走 Mock 分支
    ;(service as { client: unknown }).client = new (jest.requireMock('ali-oss') as jest.Mock)()
  }
  return service
}

describe('OSSService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('isMock', () => {
    it('mock 模式返回 true', () => {
      expect(instantiate({ mock: true }).isMock()).toBe(true)
    })

    it('非 mock 模式返回 false', () => {
      expect(instantiate({ mock: false }).isMock()).toBe(false)
    })
  })

  describe('Mock 模式', () => {
    const service = instantiate({ mock: true })

    it('构造时不实例化 ali-oss 客户端', () => {
      const OSSMock = jest.requireMock('ali-oss') as jest.Mock
      new OSSService({ ...baseConfig, mock: true })
      expect(OSSMock).not.toHaveBeenCalled()
    })

    it('upload 返回模拟 URL 且不调用真实客户端', async () => {
      const result = await service.upload('/tmp/a.png', 'assets/test/a.png')
      expect(result).toEqual({
        url: 'https://reelclone-test.oss-cn-hangzhou.aliyuncs.com/assets/test/a.png',
        key: 'assets/test/a.png',
      })
      expect(mockPut).not.toHaveBeenCalled()
    })

    it('download 直接返回本地路径', async () => {
      const result = await service.download('assets/test/a.png', '/tmp/out.png')
      expect(result).toBe('/tmp/out.png')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('delete 返回 true 不调用真实客户端', async () => {
      await expect(service.delete('assets/test/a.png')).resolves.toBe(true)
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('deleteMany 返回 true 不调用真实客户端', async () => {
      await expect(service.deleteMany(['a/1', 'a/2'])).resolves.toBe(true)
      expect(mockDeleteMulti).not.toHaveBeenCalled()
    })

    it('exists 返回 false（Mock 不探测）', async () => {
      await expect(service.exists('assets/test/a.png')).resolves.toBe(false)
      expect(mockHead).not.toHaveBeenCalled()
    })

    it('getSignedUrl 返回带 mock-signature 的占位签名 URL', async () => {
      const result = await service.getSignedUrl('assets/test/a.png', 900)
      expect(result).toContain(
        'https://reelclone-test.oss-cn-hangzhou.aliyuncs.com/assets/test/a.png',
      )
      expect(result).toContain('mock-signature')
      expect(result).toContain('expires=900')
      expect(mockSignatureUrl).not.toHaveBeenCalled()
    })

    it('getMetadata 返回默认占位元信息', async () => {
      const result = await service.getMetadata('assets/test/a.png')
      expect(result).toEqual({
        size: 0,
        mimeType: 'application/octet-stream',
        etag: 'mock-etag',
        lastModified: expect.any(Date),
      })
      expect(mockHead).not.toHaveBeenCalled()
    })
  })

  describe('真实模式', () => {
    const service = instantiate({ mock: false })

    it('构造时实例化 ali-oss 客户端', () => {
      const OSSMock = jest.requireMock('ali-oss') as jest.Mock
      OSSMock.mockClear()
      new OSSService({ ...baseConfig, mock: false })
      expect(OSSMock).toHaveBeenCalledWith(
        expect.objectContaining({
          region: baseConfig.region,
          accessKeyId: baseConfig.accessKeyId,
          accessKeySecret: baseConfig.accessKeySecret,
          bucket: baseConfig.bucket,
          secure: true,
        }),
      )
    })

    it('upload 调用 client.put 并映射 url/name', async () => {
      mockPut.mockResolvedValue({
        url: 'https://cdn.example.com/a.png',
        name: 'assets/test/a.png',
      })
      const result = await service.upload('/tmp/a.png', 'assets/test/a.png')
      expect(mockPut).toHaveBeenCalledWith('assets/test/a.png', '/tmp/a.png')
      expect(result).toEqual({
        url: 'https://cdn.example.com/a.png',
        key: 'assets/test/a.png',
      })
    })

    it('download 调用 client.get 并返回本地路径', async () => {
      mockGet.mockResolvedValue(undefined)
      const result = await service.download('assets/test/a.png', '/tmp/out.png')
      expect(mockGet).toHaveBeenCalledWith('assets/test/a.png', '/tmp/out.png')
      expect(result).toBe('/tmp/out.png')
    })

    it('delete 成功返回 true', async () => {
      mockDelete.mockResolvedValue(undefined)
      await expect(service.delete('assets/test/a.png')).resolves.toBe(true)
      expect(mockDelete).toHaveBeenCalledWith('assets/test/a.png')
    })

    it('delete 失败返回 false 并记录错误', async () => {
      mockDelete.mockRejectedValue(new Error('boom'))
      await expect(service.delete('assets/test/a.png')).resolves.toBe(false)
    })

    it('deleteMany 空数组直接返回 true', async () => {
      await expect(service.deleteMany([])).resolves.toBe(true)
      expect(mockDeleteMulti).not.toHaveBeenCalled()
    })

    it('deleteMany 超过 1000 个抛错', async () => {
      const keys = Array.from({ length: 1001 }, (_, i) => `k/${i}`)
      await expect(service.deleteMany(keys)).rejects.toThrow('不能超过 1000')
    })

    it('deleteMany 成功返回 true', async () => {
      mockDeleteMulti.mockResolvedValue(undefined)
      await expect(service.deleteMany(['a/1', 'a/2'])).resolves.toBe(true)
      expect(mockDeleteMulti).toHaveBeenCalledWith(['a/1', 'a/2'])
    })

    it('exists：head 成功返回 true', async () => {
      mockHead.mockResolvedValue(undefined)
      await expect(service.exists('assets/test/a.png')).resolves.toBe(true)
    })

    it('exists：NoSuchKey 返回 false 不记录错误', async () => {
      mockHead.mockRejectedValue({ code: 'NoSuchKey' })
      await expect(service.exists('assets/test/a.png')).resolves.toBe(false)
    })

    it('exists：其他错误返回 false 并记录日志', async () => {
      mockHead.mockRejectedValue(new Error('network'))
      await expect(service.exists('assets/test/a.png')).resolves.toBe(false)
    })

    it('getSignedUrl 转发给 client.signatureUrl', async () => {
      mockSignatureUrl.mockReturnValue('https://signed.example.com/a.png?x=1')
      const result = await service.getSignedUrl('assets/test/a.png', 600)
      expect(mockSignatureUrl).toHaveBeenCalledWith('assets/test/a.png', { expires: 600 })
      expect(result).toBe('https://signed.example.com/a.png?x=1')
    })

    it('getMetadata 从 head 响应头映射元信息', async () => {
      mockHead.mockResolvedValue({
        res: {
          headers: {
            'content-length': '12345',
            'content-type': 'image/png',
            etag: '"abc123"',
            'last-modified': 'Tue, 01 Jan 2030 00:00:00 GMT',
          },
        },
      })
      const result = await service.getMetadata('assets/test/a.png')
      expect(result).toEqual({
        size: 12345,
        mimeType: 'image/png',
        etag: 'abc123',
        lastModified: new Date('Tue, 01 Jan 2030 00:00:00 GMT'),
      })
    })
  })

  describe('buildPublicUrl', () => {
    it('默认使用 region 拼接域名', () => {
      const service = instantiate({ mock: true })
      expect(service.buildPublicUrl('assets/test/a.png')).toBe(
        'https://reelclone-test.oss-cn-hangzhou.aliyuncs.com/assets/test/a.png',
      )
    })

    it('配置 endpoint 时以 endpoint 为 host（自动带 bucket 前缀）', () => {
      const service = instantiate({ mock: true, endpoint: 'https://oss-cn-shanghai.aliyuncs.com' })
      expect(service.buildPublicUrl('assets/test/a.png')).toBe(
        'https://reelclone-test.oss-cn-shanghai.aliyuncs.com/assets/test/a.png',
      )
    })
  })
})
