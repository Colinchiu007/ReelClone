/**
 * Auth Service 启动入口
 *
 * - 全局前缀：api/v1
 * - 全局过滤器：AllExceptionsFilter
 * - 全局拦截器：ResponseInterceptor
 * - 全局 Pipe：ValidationPipe（带 class-validator）
 * - Swagger 文档：/api/docs（仅非 production 环境）
 * - 默认监听端口：3001
 */
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { AllExceptionsFilter, ResponseInterceptor, createValidationPipe } from '@reelclone/common'
import { createSwaggerConfig, setupSwagger } from '@reelclone/swagger'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  // 全局前缀
  app.setGlobalPrefix('api/v1')

  // 全局 Pipe / 过滤器 / 拦截器
  app.useGlobalPipes(createValidationPipe())
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(new ResponseInterceptor())

  // 启用 CORS（小程序开发工具/前端联调）
  app.enableCors({
    origin: true,
    credentials: true,
  })

  // Swagger 文档（非生产环境挂载）
  const configService = app.get(ConfigService)
  const nodeEnv = configService.get<string>('NODE_ENV', 'development')
  if (nodeEnv !== 'production') {
    const swaggerConfig = createSwaggerConfig({
      title: 'Auth Service API',
      description: '认证服务：微信小程序登录 / Token 刷新 / 登出（黑名单）',
      version: '0.1.0',
      tag: 'auth',
    })
    setupSwagger(app, swaggerConfig, '/api/docs')
  }

  const port = Number(configService.get<number>('PORT', 3001))
  await app.listen(port)

  const logger = new Logger('Bootstrap')
  logger.log(`🚀 auth-service is running on http://localhost:${port}`)
  if (nodeEnv !== 'production') {
    logger.log(`  → Swagger UI:  http://localhost:${port}/api/docs`)
    logger.log(`  → OpenAPI JSON: http://localhost:${port}/api/docs-json`)
  }
  logger.log(`  → POST /api/v1/auth/wechat-login`)
  logger.log(`  → POST /api/v1/auth/refresh-token`)
  logger.log(`  → POST /api/v1/auth/logout`)
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ auth-service bootstrap failed:', err)
  process.exit(1)
})
