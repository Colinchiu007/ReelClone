/**
 * Swagger 配置工厂
 *
 * 使用 @nestjs/swagger 的 DocumentBuilder 构建 OpenAPI 文档基础配置：
 *  - 标题、描述、版本
 *  - JWT Bearer 鉴权方案
 *  - 联系人 / License
 *  - 服务端 URL（可选）
 *
 * 各微服务可通过 createSwaggerConfig(options) 拿到 OpenAPIObject，
 * 再用 SwaggerModule.setup 挂载到 /api/docs 与 /api/docs-json。
 */
import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'

/** Swagger 模块配置项 */
export interface SwaggerConfigOptions {
  /** 文档标题 */
  title: string
  /** 文档描述 */
  description: string
  /** API 版本号 */
  version: string
  /** 挂载路径，默认 /api/docs */
  path?: string
  /** 服务标签（用于区分不同微服务，例如 auth-service） */
  tag?: string
  /** API 服务器基础路径（如 https://api.example.com/api/v1），可选 */
  serverUrl?: string
}

/** JWT Bearer 鉴权方案名称（与全局 JwtAuthGuard 配合） */
export const JWT_BEARER_SCHEME = 'JWT-Bearer'

/**
 * 创建 Swagger 文档配置（DocumentBuilder）
 *
 * @param options 配置项
 * @returns OpenAPIObject（包含 openapi/info/components/securitySchemes）
 */
export function createSwaggerConfig(
  options: SwaggerConfigOptions,
): Omit<OpenAPIObject, 'paths'> {
  const builder = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion(options.version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description:
          'JWT Bearer 鉴权。在「Authorize」中粘贴 accessToken（不含 "Bearer " 前缀）。' +
          '由 auth-service 通过 POST /api/v1/auth/wechat-login 签发。',
        in: 'header',
      },
      JWT_BEARER_SCHEME,
    )
    .addTag(
      options.tag ?? 'default',
      options.tag ? `${options.tag} 服务接口` : 'ReelClone 接口',
    )

  if (options.serverUrl) {
    builder.addServer(options.serverUrl)
  }

  return builder.build()
}

/**
 * 挂载 Swagger UI 与 JSON 端点到 NestJS 应用
 *
 * 暴露端点：
 *  - ${path}         Swagger UI（HTML）
 *  - ${path}-json    OpenAPI JSON
 *
 * @param app    NestApplication 实例
 * @param config OpenAPI 配置（由 createSwaggerConfig 生成）
 * @param path   挂载路径，默认 /api/docs
 */
export function setupSwagger(
  app: INestApplication,
  config: Omit<OpenAPIObject, 'paths'>,
  path: string = '/api/docs',
): void {
  const document = SwaggerModule.createDocument(app, config as OpenAPIObject)
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
    customSiteTitle: 'ReelClone API 文档',
  })
}
