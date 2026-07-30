/**
 * health.controller.ts 单元测试
 *
 * 覆盖 HealthController.check() 在以下场景的行为：
 * - 所有指标 up → status=ok
 * - 任一指标 down → status=error
 * - service 名注入（OBS_SERVICE_NAME）和默认值
 * - 响应结构包含 timestamp/uptime/info
 */
import { HealthController, type HealthResponse } from './health.controller'
import {
  DatabaseHealthIndicator,
  type HealthResult,
  RedisHealthIndicator,
} from './health.indicators'

describe('HealthController', () => {
  let controller: HealthController
  let mockDbIndicator: { ping: jest.Mock<Promise<HealthResult>> }
  let mockRedisIndicator: { ping: jest.Mock<Promise<HealthResult>> }

  beforeEach(() => {
    mockDbIndicator = { ping: jest.fn() }
    mockRedisIndicator = { ping: jest.fn() }
  })

  function createController(serviceName?: string): HealthController {
    return new HealthController(
      mockDbIndicator as unknown as DatabaseHealthIndicator,
      mockRedisIndicator as unknown as RedisHealthIndicator,
      serviceName,
    )
  }

  it('所有指标 up 时 status 应为 ok', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 1 })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 2 })
    controller = createController('auth-service')

    const result = await controller.check()

    expect(result.status).toBe('ok')
    expect(result.info.database.status).toBe('up')
    expect(result.info.redis.status).toBe('up')
  })

  it('数据库 down 时 status 应为 error', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'db down' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    controller = createController('auth-service')

    const result = await controller.check()

    expect(result.status).toBe('error')
    expect(result.info.database.status).toBe('down')
  })

  it('Redis down 时 status 应为 error', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'redis down' })
    controller = createController('auth-service')

    const result = await controller.check()

    expect(result.status).toBe('error')
    expect(result.info.redis.status).toBe('down')
  })

  it('所有指标 down 时 status 应为 error', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'db' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'redis' })
    controller = createController('auth-service')

    const result = await controller.check()

    expect(result.status).toBe('error')
  })

  it('响应应包含 ISO 时间戳', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    controller = createController('s')
    const before = new Date().toISOString()

    const result = await controller.check()
    const after = new Date().toISOString()

    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(result.timestamp >= before).toBe(true)
    expect(result.timestamp <= after).toBe(true)
  })

  it('响应应包含 process.uptime()（允许微小时间差）', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    controller = createController('s')

    const beforeUptime = process.uptime()
    const result = await controller.check()
    const afterUptime = process.uptime()

    expect(result.uptime).toBeGreaterThanOrEqual(beforeUptime)
    expect(result.uptime).toBeLessThanOrEqual(afterUptime)
  })

  it('注入 serviceName 时应写入响应', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    controller = createController('auth-service')

    const result = await controller.check()

    expect(result.service).toBe('auth-service')
  })

  it('未注入 serviceName 时 service 应为 "unknown"', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
    controller = createController(undefined)

    const result = await controller.check()

    expect(result.service).toBe('unknown')
  })

  it('应并发执行 db 和 redis 的 ping（Promise.all）', async () => {
    const order: string[] = []
    mockDbIndicator.ping.mockImplementation(async () => {
      order.push('db-start')
      await new Promise((r) => setTimeout(r, 10))
      order.push('db-end')
      return { status: 'up' }
    })
    mockRedisIndicator.ping.mockImplementation(async () => {
      order.push('redis-start')
      await new Promise((r) => setTimeout(r, 5))
      order.push('redis-end')
      return { status: 'up' }
    })
    controller = createController('s')

    await controller.check()

    // 并发执行：两个 start 应在任一 end 之前
    expect(order.indexOf('db-start')).toBeLessThan(order.indexOf('redis-end'))
    expect(order.indexOf('redis-start')).toBeLessThan(order.indexOf('db-end'))
  })

  it('响应 info 应保留 indicator 返回的 latency', async () => {
    mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 42 })
    mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 7 })
    controller = createController('s')

    const result: HealthResponse = await controller.check()

    expect(result.info.database.latency).toBe(42)
    expect(result.info.redis.latency).toBe(7)
  })
})
