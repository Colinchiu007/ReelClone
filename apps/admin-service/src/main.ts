/**
 * admin-service 入口
 *
 * 端口：3011
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard + RolesGuard
 *
 * 设计说明：
 *  - admin-service 是 HTTP 服务（非微服务 Transport），接收来自 admin-web 的 HTTP 请求
 *  - 全局 JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 *  - 全局 RolesGuard：配合 @Roles('ADMIN') 装饰器做 RBAC 角色校验
 *    所有 /admin/* 业务端点应在 Controller 级别声明 @Roles('ADMIN', 'SUPER_ADMIN')
 *  - 健康检查 /api/v1/admin/health 标记 @Public()，无需鉴权
 */
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AllExceptionsFilter, AppValidationPipe, ResponseInterceptor } from '@reelclone/common'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  // 关闭启动日志噪声：仅保留 error / warn / log，过滤 debug / verbose
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  // 全局前缀
  app.setGlobalPrefix('api/v1')

  // 全局 Pipe：参数校验
  app.useGlobalPipes(AppValidationPipe)

  // 全局拦截器：统一响应格式
  app.useGlobalInterceptors(new ResponseInterceptor())

  // 全局异常过滤器：统一错误响应
  app.useGlobalFilters(new AllExceptionsFilter())

  // CORS（admin-web 走独立域名/端口，此处允许跨域）
  app.enableCors({
    origin: true,
    credentials: true,
  })

  const port = parseInt(process.env.ADMIN_SERVICE_PORT || '3011', 10)
  await app.listen(port)

  const logger = new Logger('admin-service')
  logger.log(`admin-service listening on http://localhost:${port}`)
}

void bootstrap()
