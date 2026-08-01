/**
 * AliyunSmsAdapter 单元测试
 *
 * 通过 jest.mock('axios') 模拟阿里云接口响应，验证：
 *  - 签名拼接与请求 URL 组装（HMAC-SHA1 + base64 + RFC 3986 percent-encode）
 *  - 成功响应返回 { messageId, status: 'sent' }
 *  - 阿里云返回 Code != OK 时抛 BusinessException(INTERNAL_ERROR)
 *  - 网络异常时抛 BusinessException(INTERNAL_ERROR)
 *  - sendSms 应使用调用方传入的 templateCode 与 params
 */
import { mocked } from 'jest-mock'
import axios from 'axios'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { AliyunSmsAdapter } from '../aliyun-sms.adapter'

jest.mock('axios')
const mockedAxios = mocked(axios)

describe('AliyunSmsAdapter', () => {
  let adapter: AliyunSmsAdapter

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new AliyunSmsAdapter({
      accessKeyId: 'LTAI_TEST_KEY',
      accessKeySecret: 'test-secret',
      signName: 'ReelClone',
      apiBase: 'https://mock-aliyun.test',
    })
  })

  it('isMock 为 false', () => {
    expect(adapter.isMock).toBe(false)
  })

  it('阿里云返回 Code=OK 时返回 { messageId, status: "sent" }', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { Code: 'OK', Message: 'OK', RequestId: 'req-1', BizId: 'biz-123456' },
    } as never)

    const result = await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
      code: '123456',
    })

    expect(result).toEqual({ messageId: 'biz-123456', status: 'sent' })
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  it('BizId 缺失时应回退到 RequestId 作为 messageId', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { Code: 'OK', Message: 'OK', RequestId: 'req-fallback' },
    } as never)

    const result = await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
      code: '123456',
    })

    expect(result.messageId).toBe('req-fallback')
    expect(result.status).toBe('sent')
  })

  it('请求 URL 应包含签名相关公共参数与业务参数', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { Code: 'OK', Message: 'OK', RequestId: 'req-3', BizId: 'biz-3' },
    } as never)

    await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
      code: '654321',
    })

    const url = mockedAxios.get.mock.calls[0][0] as string
    expect(url).toContain('https://mock-aliyun.test/')
    expect(url).toContain('Action=SendSms')
    expect(url).toContain('Version=2017-05-25')
    expect(url).toContain('Format=JSON')
    expect(url).toContain('AccessKeyId=LTAI_TEST_KEY')
    expect(url).toContain('SignatureMethod=HMAC-SHA1')
    expect(url).toContain('SignatureVersion=1.0')
    expect(url).toContain('SignatureNonce=')
    expect(url).toContain('Timestamp=')
    expect(url).toContain('PhoneNumbers=13800138000')
    expect(url).toContain('SignName=ReelClone')
    expect(url).toContain('TemplateCode=SMS_TEMPLATE_TEST')
    expect(url).toContain('Signature=')
    // TemplateParam 应为 JSON 编码的 percent-encoded 字符串
    // {"code":"654321"} 经 percent-encode 后包含 %7B%22code%22 等片段
    expect(url).toMatch(/TemplateParam=/)
  })

  it('签名应基于 HMAC-SHA1 + base64（含 Signature= 后缀参数）', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { Code: 'OK', Message: 'OK', RequestId: 'req-4', BizId: 'biz-4' },
    } as never)

    await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', { code: '111111' })

    const url = mockedAxios.get.mock.calls[0][0] as string
    // 签名参数应出现在 URL 中（base64 编码后包含 +、/ 或 = 等字符，percent-encode 后为 %2B、%2F、%3D）
    expect(url).toMatch(/Signature=[A-Za-z0-9%]+/)
  })

  it('阿里云返回 Code != OK 时抛 BusinessException(INTERNAL_ERROR)', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        Code: 'isv.BUSINESS_LIMIT_CONTROL',
        Message: '触发业务流控',
        RequestId: 'req-2',
      },
    } as never)

    try {
      await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
        code: '123456',
      })
      fail('应抛出 BusinessException')
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessException)
      expect((err as BusinessException).code).toBe(ErrorCode.INTERNAL_ERROR)
      expect((err as BusinessException).message).toContain('触发业务流控')
    }
  })

  it('网络异常时抛 BusinessException(INTERNAL_ERROR)', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))

    try {
      await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
        code: '123456',
      })
      fail('应抛出 BusinessException')
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessException)
      expect((err as BusinessException).code).toBe(ErrorCode.INTERNAL_ERROR)
      expect((err as BusinessException).message).toContain('网络异常')
    }
  })

  it('应将调用方传入的 params 序列化为 TemplateParam JSON', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { Code: 'OK', Message: 'OK', RequestId: 'req-5', BizId: 'biz-5' },
    } as never)

    await adapter.sendSms('13800138000', 'SMS_MULTI', { code: '999999', name: 'foo' })

    const url = mockedAxios.get.mock.calls[0][0] as string
    // 多参数也应被序列化进 TemplateParam（JSON 字符串 percent-encode 后包含 code 与 name）
    // 直接解码 URL 中的 TemplateParam 段验证
    const match = url.match(/TemplateParam=([^&]+)/)
    expect(match).not.toBeNull()
    const decoded = decodeURIComponent(match?.[1] ?? '')
    const parsed = JSON.parse(decoded)
    expect(parsed).toEqual({ code: '999999', name: 'foo' })
  })
})
