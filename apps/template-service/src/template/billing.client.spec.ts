/**
 * BillingClient 单元测试
 *
 * 测试覆盖:
 *  - reward 成功调用 billing-service /api/v1/points/reward
 *  - billing-service 返回业务错误码时抛出 BusinessException
 *  - Axios 网络错误时抛出 INTERNAL_ERROR BusinessException
 *  - 构造函数读取环境变量配置（baseUrl / apiKey）
 */
import { ConfigService } from '@nestjs/config'
import axios, { type AxiosInstance, AxiosError } from 'axios'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { BillingClient } from './billing.client'

// -------------------- Mock axios --------------------
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}))

describe('BillingClient', () => {
  let client: BillingClient
  let postMock: jest.Mock
  let configService: jest.Mocked<ConfigService>

  beforeEach(() => {
    postMock = jest.fn()
    ;(axios.create as jest.Mock).mockReturnValue({
      post: postMock,
    } as unknown as AxiosInstance)

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'BILLING_SERVICE_URL') return 'http://billing-test:3006'
        if (key === 'INTERNAL_API_KEY') return 'test-api-key'
        return null
      }),
    } as unknown as jest.Mocked<ConfigService>

    client = new BillingClient(configService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- 构造函数 --------------------

  it('构造函数应通过 axios.create 创建带 baseURL 和 x-api-key 的实例', () => {
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'http://billing-test:3006',
      timeout: 10_000,
      headers: {
        'x-api-key': 'test-api-key',
        'Content-Type': 'application/json',
      },
    })
  })

  it('环境变量缺失时使用 fallback 默认值', () => {
    configService.get.mockReturnValue(null)
    // 模拟 process.env 也没有
    const prevUrl = process.env.BILLING_SERVICE_URL
    const prevKey = process.env.INTERNAL_API_KEY
    delete process.env.BILLING_SERVICE_URL
    delete process.env.INTERNAL_API_KEY

    new BillingClient(configService)

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:3006',
        headers: expect.objectContaining({
          'x-api-key': '',
        }),
      }),
    )

    // 恢复环境变量
    if (prevUrl) process.env.BILLING_SERVICE_URL = prevUrl
    if (prevKey) process.env.INTERNAL_API_KEY = prevKey
  })

  // -------------------- reward --------------------

  describe('reward', () => {
    it('成功调用返回 balance + transactionId', async () => {
      postMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: {
            balance: 100,
            frozen: 0,
            transactionId: 'tx-001',
          },
        },
      })

      const result = await client.reward({
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'reward:template:tmpl-001:use:0',
      })

      expect(result).toEqual({
        balance: 100,
        transactionId: 'tx-001',
      })

      // 校验 POST 请求参数
      expect(postMock).toHaveBeenCalledWith('/api/v1/points/reward', {
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'reward:template:tmpl-001:use:0',
        description: 'template:reward:tmpl-001',
      })
    })

    it('description 自定义值应传递', async () => {
      postMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { balance: 50, frozen: 0, transactionId: 'tx-002' },
        },
      })

      await client.reward({
        userId: 'user-001',
        amount: 1,
        templateId: 'tmpl-002',
        idempotencyKey: 'key-002',
        description: 'custom-description',
      })

      expect(postMock).toHaveBeenCalledWith('/api/v1/points/reward', {
        userId: 'user-001',
        amount: 1,
        templateId: 'tmpl-002',
        idempotencyKey: 'key-002',
        description: 'custom-description',
      })
    })

    it('billing-service 返回非 SUCCESS 业务错误码时抛出 BusinessException', async () => {
      postMock.mockResolvedValue({
        data: {
          code: ErrorCode.INSUFFICIENT_CREDITS,
          message: '积分不足',
          data: null,
        },
      })

      await expect(
        client.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)

      try {
        await client.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        })
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.INSUFFICIENT_CREDITS)
        expect((e as BusinessException).message).toBe('积分不足')
      }
    })

    it('Axios 网络错误且响应包含 ApiResponse 时抛出对应 BusinessException', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          data: {
            code: ErrorCode.VALIDATION_ERROR,
            message: '参数错误',
          },
        },
        message: 'Request failed with status code 422',
      } as AxiosError
      postMock.mockRejectedValue(axiosError)

      await expect(
        client.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)
    })

    it('Axios 网络错误且无响应时抛出 INTERNAL_ERROR', async () => {
      const axiosError = {
        isAxiosError: true,
        response: undefined,
        message: 'ECONNREFUSED',
      } as AxiosError
      postMock.mockRejectedValue(axiosError)

      await expect(
        client.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)

      try {
        await client.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        })
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.INTERNAL_ERROR)
        expect((e as BusinessException).message).toContain('计费服务')
      }
    })

    it('非 Axios 错误（普通 Error）时抛出 INTERNAL_ERROR', async () => {
      postMock.mockRejectedValue(new Error('未知错误'))

      await expect(
        client.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)
    })
  })
})
