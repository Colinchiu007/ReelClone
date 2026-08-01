/**
 * RealWechatAdapter 单元测试
 *
 * 使用 jest.mock('axios') 桩化微信 HTTP 接口。
 */
import axios from 'axios'
import { ErrorCode } from '@reelclone/common'
import { RealWechatAdapter } from './real-wechat.adapter'

jest.mock('axios')
const axiosGet = axios.get as jest.MockedFunction<typeof axios.get>

describe('RealWechatAdapter', () => {
  const adapter = new RealWechatAdapter('wx-appid', 'wx-secret')

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('isMock = false', () => {
    expect(adapter.isMock).toBe(false)
  })

  it('成功：返回 openid/sessionKey/unionid', async () => {
    axiosGet.mockResolvedValueOnce({
      data: { openid: 'openid_real', session_key: 'sk', unionid: 'uid' },
    } as never)
    const r = await adapter.code2session('wx-code')
    expect(axiosGet).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/sns/jscode2session',
      expect.objectContaining({
        params: expect.objectContaining({
          appid: 'wx-appid',
          secret: 'wx-secret',
          js_code: 'wx-code',
          grant_type: 'authorization_code',
        }),
        timeout: 5000,
      }),
    )
    expect(r.openid).toBe('openid_real')
    expect(r.sessionKey).toBe('sk')
    expect(r.unionid).toBe('uid')
  })

  it('unionid 缺省 → null', async () => {
    axiosGet.mockResolvedValueOnce({
      data: { openid: 'o', session_key: 's' },
    } as never)
    const r = await adapter.code2session('c')
    expect(r.unionid).toBeNull()
  })

  it('微信返回 errcode → BusinessException(UNAUTHORIZED)', async () => {
    axiosGet.mockResolvedValueOnce({
      data: { errcode: 40029, errmsg: 'invalid code' },
    } as never)
    await expect(adapter.code2session('bad')).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    })
  })

  it('errcode=0 不视为错误（边界）', async () => {
    axiosGet.mockResolvedValueOnce({
      data: { openid: 'o', session_key: 's', errcode: 0 },
    } as never)
    const r = await adapter.code2session('c')
    expect(r.openid).toBe('o')
  })

  it('网络异常 → BusinessException(INTERNAL_ERROR)', async () => {
    axiosGet.mockRejectedValueOnce(new Error('timeout'))
    await expect(adapter.code2session('c')).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
    })
  })

  it('非 Error 对象异常 → 仍抛 INTERNAL_ERROR', async () => {
    axiosGet.mockRejectedValueOnce('string error' as never)
    await expect(adapter.code2session('c')).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
    })
  })
})
