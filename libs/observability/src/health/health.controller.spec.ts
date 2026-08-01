/**
 * health.controller.ts 单元测试
 *
 * 覆盖 HealthController 的 /livez 与 /readyz 端点：
 * - liveness：进程存活返回 200，不检查依赖、不调用 indicator
 * - readiness：所有指标 up → status=ok，不设置 503
 * - readiness：任一指标 down → status=error，设置 503 并列出失败依赖
 * - service 名注入（OBS_SERVICE_NAME）和默认值
 * - 响应结构包含 timestamp/uptime/info
 */
import { HttpStatus } from '@nestjs/common'
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
  let mockRes: { status: jest.Mock<unknown, [number]> }

  beforeEach(() => {
    mockDbIndicator = { ping: jest.fn() }
    mockRedisIndicator = { ping: jest.fn() }
    mockRes = { status: jest.fn().mockReturnValue(undefined) }
  })

  function createController(serviceName?: string): HealthController {
    return new HealthController(
      mockDbIndicator as unknown as DatabaseHealthIndicator,
      mockRedisIndicator as unknown as RedisHealthIndicator,
      serviceName,
    )
  }

  // -------------------- /livez --------------------
  describe('liveness', () => {
    it('应返回 status=ok 且不检查依赖', () => {
      controller = createController('auth-service')

      const result = controller.liveness()

      expect(result.status).toBe('ok')
      expect(mockDbIndicator.ping).not.toHaveBeenCalled()
      expect(mockRedisIndicator.ping).not.toHaveBeenCalled()
    })

    it('不应包含 info（liveness 不检查依赖）', () => {
      controller = createController('s')

      const result = controller.liveness()

      expect(result.info).toBeUndefined()
    })

    it('响应应包含 ISO 时间戳', () => {
      controller = createController('s')
      const before = new Date().toISOString()

      const result = controller.liveness()
      const after = new Date().toISOString()

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(result.timestamp >= before).toBe(true)
      expect(result.timestamp <= after).toBe(true)
    })

    it('响应应包含 process.uptime()', () => {
      controller = createController('s')
      const beforeUptime = process.uptime()

      const result = controller.liveness()
      const afterUptime = process.uptime()

      expect(result.uptime).toBeGreaterThanOrEqual(beforeUptime)
      expect(result.uptime).toBeLessThanOrEqual(afterUptime)
    })

    it('注入 serviceName 时应写入响应', () => {
      controller = createController('auth-service')

      const result = controller.liveness()

      expect(result.service).toBe('auth-service')
    })

    it('未注入 serviceName 时 service 应为 "unknown"', () => {
      controller = createController(undefined)

      const result = controller.liveness()

      expect(result.service).toBe('unknown')
    })
  })

  // -------------------- /readyz --------------------
  describe('readiness', () => {
    it('所有指标 up 时 status 应为 ok 且不设置 503', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 1 })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 2 })
      controller = createController('auth-service')

      const result = await controller.readiness(mockRes)

      expect(result.status).toBe('ok')
      expect(result.info?.database.status).toBe('up')
      expect(result.info?.redis.status).toBe('up')
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('数据库 down 时 status 应为 error 并设置 503', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'db down' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      controller = createController('auth-service')

      const result = await controller.readiness(mockRes)

      expect(result.status).toBe('error')
      expect(result.info?.database.status).toBe('down')
      expect(result.info?.database.error).toBe('db down')
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE)
    })

    it('Redis down 时 status 应为 error 并设置 503', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'redis down' })
      controller = createController('auth-service')

      const result = await controller.readiness(mockRes)

      expect(result.status).toBe('error')
      expect(result.info?.redis.status).toBe('down')
      expect(result.info?.redis.error).toBe('redis down')
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE)
    })

    it('所有指标 down 时应设置 503', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'db' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'down', error: 'redis' })
      controller = createController('s')

      await controller.readiness(mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE)
    })

    it('响应应包含 ISO 时间戳', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      controller = createController('s')
      const before = new Date().toISOString()

      const result = await controller.readiness(mockRes)
      const after = new Date().toISOString()

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(result.timestamp >= before).toBe(true)
      expect(result.timestamp <= after).toBe(true)
    })

    it('响应应包含 process.uptime()', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      controller = createController('s')

      const beforeUptime = process.uptime()
      const result = await controller.readiness(mockRes)
      const afterUptime = process.uptime()

      expect(result.uptime).toBeGreaterThanOrEqual(beforeUptime)
      expect(result.uptime).toBeLessThanOrEqual(afterUptime)
    })

    it('注入 serviceName 时应写入响应', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      controller = createController('auth-service')

      const result = await controller.readiness(mockRes)

      expect(result.service).toBe('auth-service')
    })

    it('未注入 serviceName 时 service 应为 "unknown"', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up' })
      controller = createController(undefined)

      const result = await controller.readiness(mockRes)

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

      await controller.readiness(mockRes)

      // 并发执行：两个 start 应在任一 end 之前
      expect(order.indexOf('db-start')).toBeLessThan(order.indexOf('redis-end'))
      expect(order.indexOf('redis-start')).toBeLessThan(order.indexOf('db-end'))
    })

    it('响应 info 应保留 indicator 返回的 latency', async () => {
      mockDbIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 42 })
      mockRedisIndicator.ping.mockResolvedValueOnce({ status: 'up', latency: 7 })
      controller = createController('s')

      const result: HealthResponse = await controller.readiness(mockRes)

      expect(result.info?.database.latency).toBe(42)
      expect(result.info?.redis.latency).toBe(7)
    })
  })
})
