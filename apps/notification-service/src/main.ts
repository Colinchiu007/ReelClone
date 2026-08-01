/**
 * notification-service 启动入口
 *
 * - 监听端口 3008（与 docker-compose 中其它服务约定的端口划分一致）
 * - 全局前缀 api/v1，所有 HTTP 路由最终为 /api/v1/notifications/...
 * - 全局注册：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 * - 启用 CORS，便于小程序本地联调
 * - WebSocket 路径 /ws 由 NotificationGateway 处理，不走全局前缀
 */
import { NestFactory, Reflector } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  AllExceptionsFilter,
  AppValidationPipe,
  JwtAuthGuard,
  ResponseInterceptor,
} from '@reelclone/common'
import { createSwaggerConfig, setupSwagger } from '@reelclone/swagger'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const logger = new Logger('NotificationService')

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  const config = app.get(ConfigService)

  // -------------------- 全局前缀 --------------------
  // 所有 HTTP 路由前缀为 /api/v1，WebSocket 路径 /ws 由 Gateway 自行声明，不受影响
  app.setGlobalPrefix('api/v1', {
    exclude: ['livez', 'readyz'],
  })

  // -------------------- 全局管道 --------------------
  app.useGlobalPipes(AppValidationPipe)

  // -------------------- 全局拦截器 --------------------
  app.useGlobalInterceptors(new ResponseInterceptor())

  // -------------------- 全局过滤器 --------------------
  app.useGlobalFilters(new AllExceptionsFilter())

  // -------------------- 全局守卫（JWT） --------------------
  // 配合 @Public() 装饰器：默认所有接口都需登录
  const reflector = app.get(Reflector)
  app.useGlobalGuards(new JwtAuthGuard(reflector))

  // -------------------- CORS --------------------
  app.enableCors({
    origin: true,
    credentials: true,
  })

  // 确保 JwtService 在容器中可被 Gateway 直接注入（显式 get 一次以触发实例化）
  app.get(JwtService)

  // Swagger 文档（非生产环境挂载）
  const nodeEnv = config.get<string>('NODE_ENV', 'development')
  if (nodeEnv !== 'production') {
    const swaggerConfig = createSwaggerConfig({
      title: 'Notification Service API',
      description: '通知服务：站内信、WebSocket 推送',
      version: '0.1.0',
      tag: 'notification',
    })
    setupSwagger(app, swaggerConfig, '/api/docs')
  }

  const port = parseInt(config.get<string>('PORT') || '3008', 10)
  await app.listen(port)

  logger.log(`🚀 notification-service listening on http://localhost:${port}`)
  if (nodeEnv !== 'production') {
    logger.log(`  → Swagger UI:  http://localhost:${port}/api/docs`)
    logger.log(`  → OpenAPI JSON: http://localhost:${port}/api/docs-json`)
  }
  logger.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws?token=<jwt>`)
  logger.log(`🔔 REST API base:      http://localhost:${port}/api/v1/notifications`)
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[notification-service] 启动失败：', err)
  process.exit(1)
})
