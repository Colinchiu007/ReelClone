/**
 * template-service 入口
 *
 * 端口: 3005
 * 全局前缀: /api/v1
 * 全局: ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ResponseInterceptor,
  AllExceptionsFilter,
  createValidationPipe,
} from '@reelclone/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // 全局 Pipe / Interceptor / Filter
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS
  app.enableCors();

  const port = parseInt(process.env.PORT || '3005', 10);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`🚀 template-service is running on http://localhost:${port}`);
}

void bootstrap();
