/**
 * BillingClient 单元测试
 *
 * 测试覆盖:
 *  - reward 成功调用 billing-service /api/v1/points/reward
 *  - billing-service 返回业务错误码时抛出 BusinessException
 *  - Axios 网络错误时抛出 INTERNAL_ERROR BusinessException
 *  - 构造函数读取环境变量配置（baseUrl / apiKey）
 *  - getRewardCount 成功调用返回奖励次数
 *  - getRewardCount 业务错误 + 网络错误处理
 *  - getRewardOrdinals 成功调用返回序号列表
 *  - getRewardOrdinals 业务错误 + 网络错误处理
 *  - B6: 重试机制（网络错误重试成功 / 重试耗尽 / 业务错误不重试）
 *  - B6: 熔断器（连续失败触发熔断 / 熔断时快速失败 / 半开恢复）
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

/**
 * 创建 ConfigService Mock
 * - 默认 maxRetries=0（不重试），保证现有测试行为不变
 * - 重试/熔断测试可通过 overrides 覆盖
 * - getOrThrow 用于必填配置（BILLING_SERVICE_URL / INTERNAL_API_KEY）
 * - get 用于可选配置（重试/熔断参数，带默认值）
 */
function createConfigService(overrides: Record<string, string> = {}): jest.Mocked<ConfigService> {
  const getConfig = (key: string) => {
    const defaults: Record<string, string> = {
      BILLING_SERVICE_URL: 'http://billing-test:3006',
      INTERNAL_API_KEY: 'test-api-key',
      BILLING_CLIENT_MAX_RETRIES: '0', // 默认不重试
      BILLING_CLIENT_RETRY_DELAY_MS: '1', // 测试用极小延迟
      BILLING_CLIENT_CB_THRESHOLD: '5',
      BILLING_CLIENT_CB_COOLDOWN_MS: '30',
    }
    return overrides[key] ?? defaults[key] ?? null
  }
  return {
    get: jest.fn(getConfig),
    getOrThrow: jest.fn((key: string) => {
      const val = getConfig(key)
      if (val === null || val === undefined) {
        throw new Error(`config key ${key} not found`)
      }
      return val
    }),
  } as unknown as jest.Mocked<ConfigService>
}

describe('BillingClient', () => {
  let client: BillingClient
  let postMock: jest.Mock
  let getMock: jest.Mock
  let configService: jest.Mocked<ConfigService>

  beforeEach(() => {
    postMock = jest.fn()
    getMock = jest.fn()
    ;(axios.create as jest.Mock).mockReturnValue({
      post: postMock,
      get: getMock,
    } as unknown as AxiosInstance)

    configService = createConfigService()
    client = new BillingClient(configService)
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
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

  it('必填配置缺失时 fail-closed 抛出错误', () => {
    const badConfig = createConfigService()
    badConfig.getOrThrow.mockImplementation((key: string) => {
      throw new Error(`config key ${key} not found`)
    })

    expect(() => new BillingClient(badConfig)).toThrow('BILLING_SERVICE_URL')
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
      expect(postMock).toHaveBeenCalledWith(
        '/api/v1/points/reward',
        expect.objectContaining({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'reward:template:tmpl-001:use:0',
          description: 'template:reward:tmpl-001',
        }),
        expect.anything(),
      )
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

      expect(postMock).toHaveBeenCalledWith(
        '/api/v1/points/reward',
        expect.objectContaining({
          userId: 'user-001',
          amount: 1,
          templateId: 'tmpl-002',
          idempotencyKey: 'key-002',
          description: 'custom-description',
        }),
        expect.anything(),
      )
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
        expect((e as BusinessException).message).toBe('服务暂时不可用，请稍后重试')
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

  // -------------------- getRewardCount --------------------

  describe('getRewardCount', () => {
    it('成功调用返回 rewardCount', async () => {
      getMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: {
            templateId: 'tmpl-001',
            rewardCount: 7,
          },
        },
      })

      const result = await client.getRewardCount('tmpl-001')

      expect(result).toBe(7)
      // 校验 GET 请求路径
      expect(getMock).toHaveBeenCalledWith(
        '/api/v1/points/internal/templates/tmpl-001/reward-count',
        expect.anything(),
      )
    })

    it('rewardCount=0 时正确返回 0', async () => {
      getMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { templateId: 'tmpl-new', rewardCount: 0 },
        },
      })

      const result = await client.getRewardCount('tmpl-new')

      expect(result).toBe(0)
    })

    it('billing-service 返回非 SUCCESS 业务错误码时抛出 BusinessException', async () => {
      getMock.mockResolvedValue({
        data: {
          code: ErrorCode.NOT_FOUND,
          message: '模板不存在',
          data: null,
        },
      })

      await expect(client.getRewardCount('tmpl-001')).rejects.toThrow(BusinessException)

      try {
        await client.getRewardCount('tmpl-001')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
        expect((e as BusinessException).message).toBe('模板不存在')
      }
    })

    it('Axios 网络错误且响应包含 ApiResponse 时抛出对应 BusinessException', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          data: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'templateId 格式错误',
          },
        },
        message: 'Request failed with status code 422',
      } as AxiosError
      getMock.mockRejectedValue(axiosError)

      await expect(client.getRewardCount('')).rejects.toThrow(BusinessException)

      try {
        await client.getRewardCount('')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
      }
    })

    it('Axios 网络错误且无响应时抛出 INTERNAL_ERROR', async () => {
      const axiosError = {
        isAxiosError: true,
        response: undefined,
        message: 'ECONNREFUSED',
      } as AxiosError
      getMock.mockRejectedValue(axiosError)

      await expect(client.getRewardCount('tmpl-001')).rejects.toThrow(BusinessException)

      try {
        await client.getRewardCount('tmpl-001')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.INTERNAL_ERROR)
        expect((e as BusinessException).message).toBe('服务暂时不可用，请稍后重试')
      }
    })

    it('非 Axios 错误（普通 Error）时抛出 INTERNAL_ERROR', async () => {
      getMock.mockRejectedValue(new Error('未知错误'))

      await expect(client.getRewardCount('tmpl-001')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- getRewardOrdinals --------------------

  describe('getRewardOrdinals', () => {
    it('成功调用返回 ordinals 数组', async () => {
      getMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { templateId: 'tmpl-001', ordinals: [1, 2, 3] },
        },
      })

      const result = await client.getRewardOrdinals('tmpl-001')

      expect(result).toEqual([1, 2, 3])
      // 校验 GET 请求路径
      expect(getMock).toHaveBeenCalledWith(
        '/api/v1/points/internal/templates/tmpl-001/reward-ordinals',
        expect.anything(),
      )
    })

    it('ordinals 为空数组时正确返回 []', async () => {
      getMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { templateId: 'tmpl-new', ordinals: [] },
        },
      })

      const result = await client.getRewardOrdinals('tmpl-new')

      expect(result).toEqual([])
    })

    it('billing-service 返回非 SUCCESS 业务错误码时抛出 BusinessException', async () => {
      getMock.mockResolvedValue({
        data: {
          code: ErrorCode.NOT_FOUND,
          message: '模板不存在',
          data: null,
        },
      })

      await expect(client.getRewardOrdinals('tmpl-001')).rejects.toThrow(BusinessException)

      try {
        await client.getRewardOrdinals('tmpl-001')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
        expect((e as BusinessException).message).toBe('模板不存在')
      }
    })

    it('Axios 网络错误且无响应时抛出 INTERNAL_ERROR', async () => {
      const axiosError = {
        isAxiosError: true,
        response: undefined,
        message: 'ECONNREFUSED',
      } as AxiosError
      getMock.mockRejectedValue(axiosError)

      await expect(client.getRewardOrdinals('tmpl-001')).rejects.toThrow(BusinessException)

      try {
        await client.getRewardOrdinals('tmpl-001')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.INTERNAL_ERROR)
        expect((e as BusinessException).message).toBe('服务暂时不可用，请稍后重试')
      }
    })

    it('非 Axios 错误（普通 Error）时抛出 INTERNAL_ERROR', async () => {
      getMock.mockRejectedValue(new Error('未知错误'))

      await expect(client.getRewardOrdinals('tmpl-001')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- B6: 重试机制 --------------------

  describe('B6: 重试机制', () => {
    let retryClient: BillingClient
    let retryPostMock: jest.Mock

    beforeEach(() => {
      retryPostMock = jest.fn()
      ;(axios.create as jest.Mock).mockReturnValue({
        post: retryPostMock,
        get: jest.fn(),
      } as unknown as AxiosInstance)

      // maxRetries=3, retryDelay=0ms（立即重试，不依赖定时器）
      const retryConfig = createConfigService({
        BILLING_CLIENT_MAX_RETRIES: '3',
        BILLING_CLIENT_RETRY_DELAY_MS: '0',
        BILLING_CLIENT_CB_THRESHOLD: '100', // 重试测试不触发熔断
      })
      retryClient = new BillingClient(retryConfig)
    })

    it('网络错误重试后成功：应调用 2 次 post 并返回结果', async () => {
      // 第一次失败（网络错误），第二次成功
      retryPostMock
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: undefined,
          message: 'ECONNREFUSED',
        } as AxiosError)
        .mockResolvedValueOnce({
          data: {
            code: ErrorCode.SUCCESS,
            message: 'ok',
            data: { balance: 100, frozen: 0, transactionId: 'tx-001' },
          },
        })

      const result = await retryClient.reward({
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'key-001',
      })

      expect(result).toEqual({ balance: 100, transactionId: 'tx-001' })
      expect(retryPostMock).toHaveBeenCalledTimes(2)
    })

    it('5xx 错误重试：达到最大次数后抛出 INTERNAL_ERROR', async () => {
      // 全部失败（503）
      retryPostMock.mockRejectedValue({
        isAxiosError: true,
        response: { status: 503, data: { message: 'Service Unavailable' } },
        message: 'Request failed with status code 503',
      } as AxiosError)

      await expect(
        retryClient.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)

      // maxRetries=3 → 调用 4 次（1 次初始 + 3 次重试）
      expect(retryPostMock).toHaveBeenCalledTimes(4)
    })

    it('业务错误（4xx + 非 SUCCESS）不重试：只调用 1 次', async () => {
      // 422 业务错误
      retryPostMock.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 422,
          data: { code: ErrorCode.VALIDATION_ERROR, message: '参数错误' },
        },
        message: 'Request failed with status code 422',
      } as AxiosError)

      await expect(
        retryClient.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)

      // 业务错误不重试，只调用 1 次
      expect(retryPostMock).toHaveBeenCalledTimes(1)
    })

    it('billing-service 返回非 SUCCESS 业务码不重试：只调用 1 次', async () => {
      // HTTP 200 但业务码非 SUCCESS
      retryPostMock.mockResolvedValue({
        data: {
          code: ErrorCode.INSUFFICIENT_CREDITS,
          message: '积分不足',
          data: null,
        },
      })

      await expect(
        retryClient.reward({
          userId: 'user-001',
          amount: 5,
          templateId: 'tmpl-001',
          idempotencyKey: 'key-001',
        }),
      ).rejects.toThrow(BusinessException)

      expect(retryPostMock).toHaveBeenCalledTimes(1)
    })

    it('重试成功后熔断器应重置失败计数', async () => {
      // 前 2 次失败，第 3 次成功
      retryPostMock
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: undefined,
          message: 'ECONNREFUSED',
        } as AxiosError)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: undefined,
          message: 'ECONNREFUSED',
        } as AxiosError)
        .mockResolvedValueOnce({
          data: {
            code: ErrorCode.SUCCESS,
            message: 'ok',
            data: { balance: 100, frozen: 0, transactionId: 'tx-001' },
          },
        })

      const result = await retryClient.reward({
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'key-001',
      })

      expect(result.transactionId).toBe('tx-001')
      // 成功后失败计数应被重置，后续请求正常放行
      retryPostMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { balance: 100, frozen: 0, transactionId: 'tx-2' },
        },
      })
      const result2 = await retryClient.reward({
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'key-2',
      })
      expect(result2.transactionId).toBe('tx-2')
    })
  })

  // -------------------- B6: 熔断器 --------------------

  describe('B6: 熔断器', () => {
    let cbClient: BillingClient
    let cbPostMock: jest.Mock

    beforeEach(() => {
      cbPostMock = jest.fn()
      ;(axios.create as jest.Mock).mockReturnValue({
        post: cbPostMock,
        get: jest.fn(),
      } as unknown as AxiosInstance)

      // maxRetries=0（不重试，快速触发熔断）, threshold=3, cooldown=10ms（测试用短冷却）
      const cbConfig = createConfigService({
        BILLING_CLIENT_MAX_RETRIES: '0',
        BILLING_CLIENT_RETRY_DELAY_MS: '1',
        BILLING_CLIENT_CB_THRESHOLD: '3',
        BILLING_CLIENT_CB_COOLDOWN_MS: '10',
      })
      cbClient = new BillingClient(cbConfig)
    })

    it('连续失败达阈值后触发熔断：后续请求快速失败不发请求', async () => {
      // 网络错误（无 response）
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'ECONNREFUSED',
      } as AxiosError
      cbPostMock.mockRejectedValue(networkError)

      const params = {
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'key-001',
      }

      // 前 3 次失败（达到阈值 3）→ 熔断器打开
      for (let i = 0; i < 3; i++) {
        await expect(cbClient.reward(params)).rejects.toThrow(BusinessException)
      }
      expect(cbPostMock).toHaveBeenCalledTimes(3)

      // 第 4 次请求：熔断器 OPEN，快速失败，不发请求
      await expect(cbClient.reward(params)).rejects.toThrow(BusinessException)
      try {
        await cbClient.reward(params)
      } catch (e) {
        expect((e as BusinessException).message).toContain('熔断')
      }
      // postMock 调用次数仍为 3（第 4 次没发请求）
      expect(cbPostMock).toHaveBeenCalledTimes(3)
    })

    it('熔断器冷却后进入半开状态：试探请求成功则恢复', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'ECONNREFUSED',
      } as AxiosError

      const params = {
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'key-001',
      }

      // 触发熔断（3 次失败）
      cbPostMock.mockRejectedValue(networkError)
      for (let i = 0; i < 3; i++) {
        await cbClient.reward(params).catch(() => {
          /* 预期失败 */
        })
      }
      expect(cbPostMock).toHaveBeenCalledTimes(3)

      // 确认熔断中
      await expect(cbClient.reward(params)).rejects.toThrow(BusinessException)
      expect(cbPostMock).toHaveBeenCalledTimes(3)

      // 等待冷却期（10ms）
      await new Promise((resolve) => setTimeout(resolve, 20))

      // 半开状态：下一次请求成功 → 恢复 CLOSED
      cbPostMock.mockResolvedValueOnce({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { balance: 100, frozen: 0, transactionId: 'tx-recover' },
        },
      })

      const result = await cbClient.reward(params)
      expect(result).toEqual({ balance: 100, transactionId: 'tx-recover' })
      expect(cbPostMock).toHaveBeenCalledTimes(4)

      // 确认熔断器已恢复：后续请求正常放行
      cbPostMock.mockResolvedValue({
        data: {
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: { balance: 100, frozen: 0, transactionId: 'tx-2' },
        },
      })
      const result2 = await cbClient.reward(params)
      expect(result2.transactionId).toBe('tx-2')
      expect(cbPostMock).toHaveBeenCalledTimes(5)
    })

    it('熔断器半开状态试探失败：重新打开熔断器', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'ECONNREFUSED',
      } as AxiosError

      const params = {
        userId: 'user-001',
        amount: 5,
        templateId: 'tmpl-001',
        idempotencyKey: 'key-001',
      }

      // 触发熔断
      cbPostMock.mockRejectedValue(networkError)
      for (let i = 0; i < 3; i++) {
        await cbClient.reward(params).catch(() => {
          /* 预期失败 */
        })
      }

      // 等待冷却期
      await new Promise((resolve) => setTimeout(resolve, 20))

      // 半开状态：试探请求失败 → 重新打开
      cbPostMock.mockRejectedValueOnce(networkError)
      await expect(cbClient.reward(params)).rejects.toThrow(BusinessException)

      // 熔断器重新 OPEN：后续请求快速失败
      await expect(cbClient.reward(params)).rejects.toThrow(BusinessException)
      // 只多调用了 1 次（半开试探），后续快速失败
      expect(cbPostMock).toHaveBeenCalledTimes(4)
    })
  })
})
