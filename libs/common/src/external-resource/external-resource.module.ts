/**
 * ExternalResourceModule — 外部资源访问安全策略模块
 *
 * 提供 ExternalResourcePolicyService 供需要访问外部 URL 的服务注入：
 *  - VideoDownloaderService（视频下载前校验 URL）
 *  - 任何需要 SSRF 防护的 HTTP 客户端调用
 *
 * 配置（可选，均带默认值）：
 *  - EXTERNAL_RESOURCE_ALLOWED_HOSTS: 逗号分隔的 host 列表
 *  - EXTERNAL_RESOURCE_MAX_REDIRECTS: 最大 redirect 深度（默认 5）
 *  - EXTERNAL_RESOURCE_MAX_RESPONSE_BYTES: 最大响应体字节（默认 500MB）
 *  - EXTERNAL_RESOURCE_MAX_RESPONSE_MS: 最大响应时长毫秒（默认 60000）
 *
 * 用法：
 *   @Module({
 *     imports: [ExternalResourceModule],
 *   })
 *   export class AiModule {}
 *
 * 然后在 service 中注入：
 *   constructor(private readonly policy: ExternalResourcePolicyService) {}
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ExternalResourcePolicyService } from './external-resource-policy'

export { ExternalResourcePolicyService }

/**
 * 从环境变量解析逗号分隔的 host 列表
 */
function parseHostsFromEnv(raw: string | undefined): string[] | undefined {
  if (!raw || raw.trim() === '') return undefined
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ExternalResourcePolicyService,
      useFactory: (config: ConfigService) => {
        return new ExternalResourcePolicyService({
          allowedHosts: parseHostsFromEnv(config.get<string>('EXTERNAL_RESOURCE_ALLOWED_HOSTS')),
          maxRedirectDepth: config.get<number>('EXTERNAL_RESOURCE_MAX_REDIRECTS'),
          maxResponseBytes: config.get<number>('EXTERNAL_RESOURCE_MAX_RESPONSE_BYTES'),
          maxResponseMs: config.get<number>('EXTERNAL_RESOURCE_MAX_RESPONSE_MS'),
        })
      },
      inject: [ConfigService],
    },
  ],
  exports: [ExternalResourcePolicyService],
})
export class ExternalResourceModule {}
