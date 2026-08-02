import { isRetryableError } from './http-client'
import type { AxiosError } from 'axios'

describe('isRetryableError', () => {
  it('无 response 的错误（网络错误）可重试', () => {
    const err = { message: 'ECONNREFUSED', response: undefined } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(true)
  })

  it('500 错误可重试', () => {
    const err = { response: { status: 500 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(true)
  })

  it('503 错误可重试', () => {
    const err = { response: { status: 503 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(true)
  })

  it('400 错误不可重试', () => {
    const err = { response: { status: 400 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(false)
  })

  it('404 错误不可重试', () => {
    const err = { response: { status: 404 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(false)
  })

  it('429 错误不可重试', () => {
    const err = { response: { status: 429 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(false)
  })

  it('非 Axios 错误可重试（无 response）', () => {
    const err = new Error('random error')
    expect(isRetryableError(err)).toBe(true)
  })
})
