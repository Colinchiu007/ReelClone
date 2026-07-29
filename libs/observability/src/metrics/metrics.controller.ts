/**
 * MetricsController — Prometheus 指标暴露端点
 *
 * GET /metrics
 * 响应 Content-Type: text/plain; version=0.0.4; charset=utf-8
 * 响应体为 Prometheus 文本格式指标数据，供 Prometheus / Grafana 抓取。
 */
import { Controller, Get, Header } from '@nestjs/common'
import { register } from 'prom-client'

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    return register.metrics()
  }
}
