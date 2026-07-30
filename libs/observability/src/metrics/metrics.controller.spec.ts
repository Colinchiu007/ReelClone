/**
 * metrics.controller.ts 单元测试
 *
 * 覆盖 MetricsController.metrics() 端点：
 * - 调用 register.metrics() 返回文本
 * - 返回内容为 Prometheus 文本格式
 *
 * 注意：@Header 装饰器的元数据是 NestJS 框架职责，不在业务逻辑测试范围内。
 */
import { Counter, register } from 'prom-client'
import { MetricsController } from './metrics.controller'

describe('MetricsController', () => {
  let controller: MetricsController

  beforeEach(() => {
    register.clear()
    controller = new MetricsController()
  })

  afterEach(() => {
    register.clear()
  })

  it('应返回字符串类型的结果', async () => {
    const result = await controller.metrics()
    expect(typeof result).toBe('string')
  })

  it('应调用 register.metrics() 获取指标文本', async () => {
    const spy = jest.spyOn(register, 'metrics')
    await controller.metrics()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('空 register 时应返回空白或仅换行', async () => {
    const result = await controller.metrics()
    expect(result.trim()).toBe('')
  })

  it('注册指标后应返回非空文本', async () => {
    const counter = new Counter({
      name: 'test_counter',
      help: 'test counter',
    })
    counter.inc()
    const result = await controller.metrics()
    expect(result).toContain('test_counter')
    expect(result).toContain('HELP test_counter test counter')
    expect(result).toContain('TYPE test_counter counter')
  })
})
