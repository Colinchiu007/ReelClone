/**
 * TemplateClient — 调用 template-service 的 HTTP 客户端
 *
 * 使用 axios 直接调用 template-service 内部 API：
 *  - POST /api/v1/templates/internal/publish     发布模板（作品转模板）
 *  - POST /api/v1/templates/:id/increment-use     模板使用次数 +1（基于模板创作时）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosError, type AxiosInstance } from 'axios'
import { BusinessException, ErrorCode } from '@reelclone/common'

/** template-service 响应体（ApiResponse 包裹） */
interface TemplateApiResponse<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

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
  private readonly logger = new Logger(TemplateClient.name)
  private readonly httpClient: AxiosInstance

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('TEMPLATE_SERVICE_URL') ||
      process.env.TEMPLATE_SERVICE_URL ||
      'http://localhost:3004'
    const apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || process.env.INTERNAL_API_KEY || ''

    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * 发布模板（作品转模板）
   * 调用 template-service 内部接口，创建 PENDING_REVIEW 状态的模板。
   *
   * @param params 发布参数（含 userId）
   * @returns 模板 ID
   */
  async publishTemplate(params: PublishTemplateParams): Promise<PublishTemplateResult> {
    const data = await this.post<{ id: string }>(
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
    await this.post(`/api/v1/templates/${templateId}/increment-use`, {})
  }

  /**
   * 统一 POST 请求封装
   * - 解析 ApiResponse 包裹，提取 data
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.httpClient.post<TemplateApiResponse<T>>(path, body)
      const resp = response.data

      if (resp.code !== ErrorCode.SUCCESS) {
        throw new BusinessException(
          resp.code as ErrorCode,
          resp.message || 'template-service 调用失败',
        )
      }

      return resp.data
    } catch (err) {
      // 已是 BusinessException，直接抛出
      if (err instanceof BusinessException) {
        throw err
      }

      // Axios 错误：尝试解析 template-service 返回的 ApiResponse
      const axiosErr = err as AxiosError<TemplateApiResponse<unknown>>
      const respData = axiosErr.response?.data
      if (respData && typeof respData.code === 'number') {
        throw new BusinessException(
          respData.code as ErrorCode,
          respData.message || 'template-service 调用失败',
        )
      }

      // 网络错误等
      this.logger.error(`调用 template-service 失败: ${path} ${(err as Error).message}`)
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '模板服务暂时不可用，请稍后重试', {
        path,
        message: (err as Error).message,
      })
    }
  }
}
