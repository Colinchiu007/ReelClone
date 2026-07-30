/**
 * ReelClone asset-service 启动入口
 *
 * 端口：3003
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ResponseInterceptor, AllExceptionsFilter, createValidationPipe } from '@reelclone/common'
import { createSwaggerConfig, setupSwagger } from '@reelclone/swagger'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  // 全局前缀
  app.setGlobalPrefix('api/v1')

  // 全局 Pipe / Interceptor / Filter
  app.useGlobalPipes(createValidationPipe())
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  // CORS
  app.enableCors()

  // Swagger 文档（非生产环境挂载）
  const nodeEnv = process.env.NODE_ENV || 'development'
  if (nodeEnv !== 'production') {
    const swaggerConfig = createSwaggerConfig({
      title: 'Asset Service API',
      description: '资产服务：数字人/语音包/素材管理',
      version: '0.1.0',
      tag: 'asset',
    })
    setupSwagger(app, swaggerConfig, '/api/docs')
  }

  const port = parseInt(process.env.PORT || '3003', 10)
  await app.listen(port)

  // eslint-disable-next-line no-console
  console.log(`🚀 asset-service is running on http://localhost:${port}`)
  if (nodeEnv !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`  → Swagger UI:  http://localhost:${port}/api/docs`)
    // eslint-disable-next-line no-console
    console.log(`  → OpenAPI JSON: http://localhost:${port}/api/docs-json`)
  }
}

void bootstrap()
