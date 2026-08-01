/**
 * billing-service 入口
 *
 * 端口：3006
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard + InternalApiKeyGuard
 */
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AllExceptionsFilter, AppValidationPipe, ResponseInterceptor, failClosedStartupCheck } from '@reelclone/common'
import { createSwaggerConfig, setupSwagger } from '@reelclone/swagger'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  failClosedStartupCheck()

  const app = await NestFactory.create(AppModule)

  // 全局前缀（/livez、/readyz 健康检查端点排除，不依赖业务前缀）
  app.setGlobalPrefix('api/v1', {
    exclude: ['livez', 'readyz'],
  })

  // 全局 Pipe：参数校验
  app.useGlobalPipes(AppValidationPipe)

  // 全局拦截器：统一响应格式
  app.useGlobalInterceptors(new ResponseInterceptor())

  // 全局异常过滤器：统一错误响应
  app.useGlobalFilters(new AllExceptionsFilter())

  // CORS（小程序走 HTTPS 网关，此处允许同源调试）
  app.enableCors({
    origin: true,
    credentials: true,
  })

  // Swagger 文档（非生产环境挂载）
  const nodeEnv = process.env.NODE_ENV || 'development'
  if (nodeEnv !== 'production') {
    const swaggerConfig = createSwaggerConfig({
      title: 'Billing Service API',
      description: '计费服务：积分冻结/结算/退还、流水查询、对账',
      version: '0.1.0',
      tag: 'billing',
    })
    setupSwagger(app, swaggerConfig, '/api/docs')
  }

  const port = parseInt(process.env.PORT || '3006', 10)
  await app.listen(port)

  const logger = new Logger('billing-service')
  logger.log(`billing-service listening on http://localhost:${port}`)
  if (nodeEnv !== 'production') {
    logger.log(`  → Swagger UI:  http://localhost:${port}/api/docs`)
    logger.log(`  → OpenAPI JSON: http://localhost:${port}/api/docs-json`)
  }
}

void bootstrap()
