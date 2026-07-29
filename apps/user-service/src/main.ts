/**
 * ReelClone user-service 启动入口
 *
 * 端口：3002
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard + RateLimitGuard
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  AllExceptionsFilter,
  AppValidationPipe,
  JwtAuthGuard,
  RateLimitGuard,
  ResponseInterceptor,
} from '@reelclone/common';

async function bootstrap(): Promise<void> {
  const logger = new Logger('UserService');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // 全局 Pipe（参数校验）
  app.useGlobalPipes(AppValidationPipe);

  // 全局拦截器（统一响应格式）
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局守卫：JWT 鉴权 + 限流
  const jwtAuthGuard = app.get(JwtAuthGuard);
  app.useGlobalGuards(jwtAuthGuard, app.get(RateLimitGuard));

  // CORS
  app.enableCors();

  const port = parseInt(process.env.PORT || '3002', 10);
  await app.listen(port);
  logger.log(`user-service listening on http://localhost:${port}`);
}

void bootstrap();
