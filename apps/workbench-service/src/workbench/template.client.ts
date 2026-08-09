/**
 * TemplateClient - 调用 template-service 的 HTTP 客户端
 *
 * 使用 @reelclone/http-client 统一内部 HTTP 调用。
 *
 * 端点：
 *  - POST /api/v1/templates/internal/publish     发布模板（作品转模板）
 *  - POST /api/v1/templates/:id/increment-use     模板使用次数 +1（基于模板创作时）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'

/** 发布模板入参（与 template-service 的 PublishTemplateDto 对齐） */
export interface PublishTemplateParams {
  userId: string
  title: string
  description?: string
  prompt: string
  coverKey?: string
  videoKey?: string
  category?: string
  industry?: string
  platform?: string
  tags?: string[]
  sourceWorkId?: string
}

/** 发布模板返回 */
export interface PublishTemplateResult {
  templateId: string
}

@Injectable()
export class TemplateClient {
  private readonly client: InternalHttpClient

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.getOrThrow<string>('TEMPLATE_SERVICE_URL')
    const apiKey = this.configService.getOrThrow<string>('INTERNAL_API_KEY')

    this.client = new InternalHttpClient({ baseUrl, apiKey })
  }

  /**
   * 发布模板（作品转模板）
   * 调用 template-service 内部接口，创建 PENDING_REVIEW 状态的模板。
   *
   * @param params 发布参数（含 userId）
   * @returns 模板 ID
   */
  async publishTemplate(params: PublishTemplateParams): Promise<PublishTemplateResult> {
    const data = await this.client.post<{ id: string }>(
      '/api/v1/templates/internal/publish',
      params as unknown as Record<string, unknown>,
    )
    return { templateId: data.id }
  }

  /**
   * 模板使用次数 +1
   * 在"基于模板创作"成功后调用。
   *
   * @param templateId 模板 ID
   */
  async incrementUseCount(templateId: string): Promise<void> {
    await this.client.post(`/api/v1/templates/${templateId}/increment-use`, {})
  }
}
