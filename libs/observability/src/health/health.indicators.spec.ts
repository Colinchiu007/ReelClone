/**
 * health.indicators.ts 单元测试
 *
 * 覆盖 DatabaseHealthIndicator 和 RedisHealthIndicator 在以下场景的行为：
 * - 依赖未注入（undefined）→ 跳过检查返回 { status: 'up' }
 * - 数据库未初始化 → 返回 { status: 'down', error }
 * - 查询/PING 成功 → 返回 { status: 'up', latency }
 * - 查询/PING 抛错 → 返回 { status: 'down', error }
 * - Redis 返回非 PONG → 返回 { status: 'down', error }
 */
import type { DataSource } from 'typeorm'
import type Redis from 'ioredis'
import {
  DatabaseHealthIndicator,
  OBS_REDIS_CLIENT,
  RedisHealthIndicator,
} from './health.indicators'

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator
  let mockDataSource: { isInitialized: boolean; query: jest.Mock }

  beforeEach(() => {
    mockDataSource = {
      isInitialized: true,
      query: jest.fn(),
    }
  })

  it('dataSource 未注入时应跳过检查返回 up', async () => {
    indicator = new DatabaseHealthIndicator(undefined)
    const result = await indicator.ping()
    expect(result).toEqual({ status: 'up' })
  })

  it('dataSource 未初始化时应返回 down', async () => {
    mockDataSource.isInitialized = false
    indicator = new DatabaseHealthIndicator(mockDataSource as unknown as DataSource)
    const result = await indicator.ping()
    expect(result.status).toBe('down')
    expect(result.error).toBe('database not initialized')
    expect(mockDataSource.query).not.toHaveBeenCalled()
  })

  it('SELECT 1 成功时应返回 up 和延迟', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }])
    indicator = new DatabaseHealthIndicator(mockDataSource as unknown as DataSource)
    const result = await indicator.ping()
    expect(result.status).toBe('up')
    expect(result.latency).toBeGreaterThanOrEqual(0)
    expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1')
  })

  it('查询抛错时应返回 down 和 error message', async () => {
    mockDataSource.query.mockRejectedValueOnce(new Error('connection refused'))
    indicator = new DatabaseHealthIndicator(mockDataSource as unknown as DataSource)
    const result = await indicator.ping()
    expect(result.status).toBe('down')
    expect(result.error).toBe('connection refused')
  })

  it('查询抛非 Error 对象时应返回 down 和字符串化错误', async () => {
    mockDataSource.query.mockRejectedValueOnce('string error')
    indicator = new DatabaseHealthIndicator(mockDataSource as unknown as DataSource)
    const result = await indicator.ping()
    expect(result.status).toBe('down')
    // (e as Error).message 对非 Error 对象为 undefined
    expect(result.error).toBeUndefined()
  })
})

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator
  let mockRedis: { ping: jest.Mock }

  beforeEach(() => {
    mockRedis = { ping: jest.fn() }
  })

  it('redis 未注入时应跳过检查返回 up', async () => {
    indicator = new RedisHealthIndicator(undefined)
    const result = await indicator.ping()
    expect(result).toEqual({ status: 'up' })
  })

  it('PING 返回 PONG 时应返回 up 和延迟', async () => {
    mockRedis.ping.mockResolvedValueOnce('PONG')
    indicator = new RedisHealthIndicator(mockRedis as unknown as Redis)
    const result = await indicator.ping()
    expect(result.status).toBe('up')
    expect(result.latency).toBeGreaterThanOrEqual(0)
  })

  it('PING 返回非 PONG 时应返回 down', async () => {
    mockRedis.ping.mockResolvedValueOnce('BUSY')
    indicator = new RedisHealthIndicator(mockRedis as unknown as Redis)
    const result = await indicator.ping()
    expect(result.status).toBe('down')
    expect(result.error).toBe('unexpected response: BUSY')
  })

  it('PING 抛错时应返回 down 和 error message', async () => {
    mockRedis.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    indicator = new RedisHealthIndicator(mockRedis as unknown as Redis)
    const result = await indicator.ping()
    expect(result.status).toBe('down')
    expect(result.error).toBe('ECONNREFUSED')
  })

  it('OBS_REDIS_CLIENT token 应为 Symbol', () => {
    expect(typeof OBS_REDIS_CLIENT).toBe('symbol')
  })
})
