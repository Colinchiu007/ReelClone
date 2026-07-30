/**
 * workbench-service 入口
 *
 * 端口：3007
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AllExceptionsFilter, AppValidationPipe, ResponseInterceptor } from '@reelclone/common'
import { createSwaggerConfig, setupSwagger } from '@reelclone/swagger'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  // 全局前缀
  app.setGlobalPrefix('api/v1')

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
      title: 'Workbench Service API',
      description: '工作台服务：生成任务提交、查询、取消',
      version: '0.1.0',
      tag: 'workbench',
    })
    setupSwagger(app, swaggerConfig, '/api/docs')
  }

  const port = parseInt(process.env.PORT || '3007', 10)
  await app.listen(port)

  const logger = new Logger('workbench-service')
  logger.log(`workbench-service listening on http://localhost:${port}`)
  if (nodeEnv !== 'production') {
    logger.log(`  → Swagger UI:  http://localhost:${port}/api/docs`)
    logger.log(`  → OpenAPI JSON: http://localhost:${port}/api/docs-json`)
  }
  const mockMode = process.env.TEMPORAL_MOCK_MODE === 'true'
  logger.log(`Temporal mock mode: ${mockMode ? 'ENABLED' : 'DISABLED'}`)
}

void bootstrap()
