/**
 * STSService 单元测试
 *
 * 覆盖：
 *  - Mock 模式：assumeRole / generateUploadToken / generateFormPolicy 返回模拟凭证
 *  - 真实模式：AssumeRole 调用、凭证映射、roleArn 缺失抛错、权限策略校验
 *  - Policy/签名：条件约束（bucket / starts-with / content-length-range）、STS Endpoint 推导
 */
import { STSService } from './sts.service'
import type { OSSConfig } from './types'

// -------------------- mock STS SDK --------------------

const mockAssumeRoleImpl = jest.fn()
const mockAssumeRoleRequest = jest.fn()
const mockConfigOptions = jest.fn()

jest.mock('@alicloud/sts20150401', () => {
  class MockStsClient {
    constructor(_config: unknown) {}
    async assumeRole(request: unknown) {
      return mockAssumeRoleImpl(request)
    }
  }
  class MockAssumeRoleRequest {
    constructor(args: unknown) {
      mockAssumeRoleRequest(args)
    }
  }
  return {
    __esModule: true,
    default: MockStsClient,
    AssumeRoleRequest: MockAssumeRoleRequest,
  }
})

jest.mock('@alicloud/openapi-client', () => {
  class MockConfig {
    constructor(public options: Record<string, unknown>) {
      mockConfigOptions(options)
    }
  }
  return {
    __esModule: true,
    default: {},
    Config: MockConfig,
  }
})

// -------------------- 测试基座 --------------------

const baseConfig: OSSConfig = {
  region: 'oss-cn-hangzhou',
  accessKeyId: 'test-access-key-id',
  accessKeySecret: 'test-access-key-secret',
  bucket: 'reelclone-test',
  roleArn: 'acs:ram::123456789:role/reelclone',
}

/** 直接构造实例并替换 logger（避免测试输出干扰） */
function instantiate(overrides: Partial<OSSConfig> = {}): STSService {
  const service = Object.create(STSService.prototype) as STSService
  ;(service as { config: OSSConfig }).config = { ...baseConfig, ...overrides }
  ;(service as { logger: unknown }).logger = {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
  return service
}

describe('STSService', () => {
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

    it('assumeRole 返回带 userId 标识的模拟凭证', async () => {
      const token = await service.assumeRole('user-1', 'assets/user-1', 3600)
      expect(token.accessKeyId).toBe('mock-sts-access-key-id-for-user-1')
      expect(token.accessKeySecret).toBe('mock-sts-access-key-secret')
      expect(token.securityToken).toContain('mock-security-token')
      expect(token.bucket).toBe('reelclone-test')
      expect(token.region).toBe('oss-cn-hangzhou')
      expect(token.host).toBe('https://reelclone-test.oss-cn-hangzhou.aliyuncs.com')
      expect(token.expiration).toBeDefined()
      expect(mockAssumeRoleImpl).not.toHaveBeenCalled()
    })

    it('generateUploadToken 返回完整上传凭证', async () => {
      const upload = await service.generateUploadToken(
        'user-1',
        'assets/user-1',
        600,
        'assets/user-1/a.png',
      )
      expect(upload.stsToken.accessKeyId).toBe('mock-sts-access-key-id-for-user-1')
      expect(upload.key).toBe('assets/user-1/a.png')
      expect(upload.expireSeconds).toBe(600)
      expect(upload.policy).toBeDefined()
      expect(upload.signature).toBeDefined()
      expect(upload.uploadHost).toBe('https://reelclone-test.oss-cn-hangzhou.aliyuncs.com')
      expect(mockAssumeRoleImpl).not.toHaveBeenCalled()
    })

    it('generateUploadToken 未传 key 时返回 undefined', async () => {
      const upload = await service.generateUploadToken('user-1', 'assets/user-1', 600)
      expect(upload.key).toBeUndefined()
    })

    it('generateFormPolicy 返回可解码的 Policy 与签名', async () => {
      const { policy, signature, policyObject } = await service.generateFormPolicy(
        'assets/user-1',
        600,
      )
      // Base64 解码后应还原为同一 Policy 对象
      expect(Buffer.from(policy, 'base64').toString('utf8')).toBe(JSON.stringify(policyObject))
      expect(policyObject.expiration).toBeDefined()
      expect(policyObject.conditions).toContainEqual({ bucket: 'reelclone-test' })
      expect(policyObject.conditions).toContainEqual(['starts-with', '$key', 'assets/user-1/'])
      expect(policyObject.conditions).toContainEqual(['content-length-range', 0, 100 * 1024 * 1024])
      // 签名应为非空字符串
      expect(signature).toBeTruthy()
    })

    it('generateFormPolicy 支持自定义 maxContentLength', async () => {
      const service2 = instantiate({ mock: true, maxContentLength: 1024 })
      const { policyObject } = await service2.generateFormPolicy('a', 60)
      expect(policyObject.conditions).toContainEqual(['content-length-range', 0, 1024])
    })

    it('前缀首尾斜杠会被归一化', async () => {
      const { policyObject } = await service.generateFormPolicy('/assets/user-1/', 60)
      expect(policyObject.conditions).toContainEqual(['starts-with', '$key', 'assets/user-1/'])
    })
  })

  describe('真实模式', () => {
    it('未配置 roleArn 时 assumeRole 抛错', async () => {
      const service = instantiate({ mock: false, roleArn: undefined })
      await expect(service.assumeRole('user-1', 'assets/user-1')).rejects.toThrow(
        '未配置 OSS_ROLE_ARN',
      )
    })

    it('assumeRole 调用 STS 客户端并映射凭证', async () => {
      mockAssumeRoleImpl.mockResolvedValue({
        body: {
          credentials: {
            accessKeyId: 'tmp-ak',
            accessKeySecret: 'tmp-sk',
            securityToken: 'tmp-token',
            expiration: '2026-08-25T10:00:00Z',
          },
        },
      })
      const service = instantiate({ mock: false })
      const token = await service.assumeRole('user-1', 'assets/user-1', 1800)
      expect(mockAssumeRoleRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          roleArn: baseConfig.roleArn,
          roleSessionName: 'reelclone-sts-user-1',
          durationSeconds: 1800,
        }),
      )
      expect(token).toEqual({
        accessKeyId: 'tmp-ak',
        accessKeySecret: 'tmp-sk',
        securityToken: 'tmp-token',
        expiration: '2026-08-25T10:00:00Z',
        bucket: 'reelclone-test',
        region: 'oss-cn-hangzhou',
        host: 'https://reelclone-test.oss-cn-hangzhou.aliyuncs.com',
      })
    })

    it('assumeRole 响应缺少 credentials 时抛错', async () => {
      mockAssumeRoleImpl.mockResolvedValue({ body: {} })
      const service = instantiate({ mock: false })
      await expect(service.assumeRole('user-1', 'assets/user-1')).rejects.toThrow(
        '缺少 credentials',
      )
    })

    it('请求中的权限策略显式 Allow 前缀操作并 Deny 删除', async () => {
      mockAssumeRoleImpl.mockResolvedValue({
        body: {
          credentials: {
            accessKeyId: 'a',
            accessKeySecret: 'b',
            securityToken: 'c',
            expiration: 'exp',
          },
        },
      })
      const service = instantiate({ mock: false })
      await service.assumeRole('user-1', 'assets/user-1')
      const args = mockAssumeRoleRequest.mock.calls[0][0] as { policy: string }
      const policy = JSON.parse(args.policy) as {
        Version: string
        Statement: Array<{ Effect: string; Action: string[]; Resource?: string[] }>
      }
      expect(policy.Version).toBe('1')
      const allow = policy.Statement.find((s) => s.Effect === 'Allow')
      const deny = policy.Statement.find((s) => s.Effect === 'Deny')
      expect(allow?.Action).toEqual(
        expect.arrayContaining([
          'oss:PutObject',
          'oss:GetObject',
          'oss:HeadObject',
          'oss:ListObjects',
        ]),
      )
      expect(allow?.Resource).toEqual([
        'acs:oss:*:*:reelclone-test/assets/user-1*',
        'acs:oss:*:*:reelclone-test/assets/user-1/*',
      ])
      expect(deny?.Action).toEqual(expect.arrayContaining(['oss:DeleteObject', 'oss:DeleteBucket']))
    })

    it('STS 客户端使用推导出的 STS Endpoint', async () => {
      mockAssumeRoleImpl.mockResolvedValue({
        body: {
          credentials: {
            accessKeyId: 'a',
            accessKeySecret: 'b',
            securityToken: 'c',
            expiration: 'exp',
          },
        },
      })
      const service = instantiate({ mock: false })
      await service.assumeRole('user-1', 'assets/user-1')
      expect(mockConfigOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          accessKeyId: baseConfig.accessKeyId,
          accessKeySecret: baseConfig.accessKeySecret,
          endpoint: 'sts.cn-hangzhou.aliyuncs.com',
          type: 'access_key',
        }),
      )
    })

    it('generateUploadToken 在真实模式下整合 STS + Policy + 签名', async () => {
      mockAssumeRoleImpl.mockResolvedValue({
        body: {
          credentials: {
            accessKeyId: 'a',
            accessKeySecret: 'b',
            securityToken: 'c',
            expiration: 'exp',
          },
        },
      })
      const service = instantiate({ mock: false })
      const upload = await service.generateUploadToken('user-1', 'assets/user-1', 900)
      expect(upload.stsToken.accessKeyId).toBe('a')
      expect(upload.expireSeconds).toBe(900)
      expect(upload.policy).toBeDefined()
      expect(upload.signature).toBeDefined()
      // 签名应为合法的 Base64 字符串
      expect(() => Buffer.from(upload.signature, 'base64').toString('utf8')).not.toThrow()
    })
  })

  describe('Bucket Host', () => {
    it('配置 endpoint 时以 endpoint 为 host（自动带 bucket 前缀）', async () => {
      const service = instantiate({
        mock: true,
        endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
      })
      const token = await service.assumeRole('user-1', 'a', 600)
      expect(token.host).toBe('https://reelclone-test.oss-cn-shanghai.aliyuncs.com')
    })
  })
})
