/**
 * SwaggerModuleConfig — 动态模块封装
 *
 * 提供静态方法 forRoot(options) 返回 DynamicModule，
 * 各微服务在 AppModule 中通过 imports 引入即可挂载 Swagger 文档。
 *
 * 使用示例：
 *
 * ```ts
 * @Module({
 *   imports: [
 *     // ...其他模块
 *     SwaggerModuleConfig.forRoot({
 *       title: 'Auth Service API',
 *       description: '认证服务：微信登录 / Token 刷新 / 登出',
 *       version: '0.1.0',
 *       tag: 'auth',
 *       path: '/api/docs',
 *     }),
 *   ],
 * })
 * export class AppModule implements OnModuleInit {
 *   constructor(private readonly app: NestApplication) {}
 *   onModuleInit() {
 *     // DocumentBuilder 在模块初始化阶段可用，但 Swagger UI 需在 app.listen 之前 setup
 *   }
 * }
 * ```
 *
 * 注意：Swagger UI 必须在 `app.listen()` 之前通过 setupSwagger 挂载，
 * 推荐在 main.ts 中按以下方式使用：
 *
 * ```ts
 * import { createSwaggerConfig, setupSwagger } from '@reelclone/swagger'
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule)
 *   app.setGlobalPrefix('api/v1')
 *   // ...全局管道/过滤器/拦截器
 *   const config = createSwaggerConfig({
 *     title: 'Auth Service API',
 *     description: '认证服务',
 *     version: '0.1.0',
 *     tag: 'auth',
 *   })
 *   setupSwagger(app, config, '/api/docs')
 *   await app.listen(3001)
 * }
 * ```
 *
 * 因此 SwaggerModuleConfig.forRoot 主要用于声明依赖与配置载体，
 * 实际 setupSwagger 调用仍在 main.ts 中完成，以保持与全局前缀的顺序一致。
 */
import { DynamicModule, Module, Provider } from '@nestjs/common'
import {
  createSwaggerConfig,
  SwaggerConfigOptions,
} from './swagger.config'

/** Swagger 配置注入 Token */
export const SWAGGER_OPTIONS = 'SWAGGER_OPTIONS'

/**
 * Swagger 配置模块
 *
 * 通过 forRoot 接收配置，将 OpenAPI 配置对象注入到容器中，
 * 供 main.ts 中 setupSwagger 使用。
 */
@Module({})
export class SwaggerModuleConfig {
  /**
   * 创建携带 Swagger 配置的动态模块
   *
   * @param options Swagger 配置项
   * @returns DynamicModule
   */
  static forRoot(options: SwaggerConfigOptions): DynamicModule {
    const swaggerOptionsProvider: Provider = {
      provide: SWAGGER_OPTIONS,
      useValue: options,
    }

    return {
      module: SwaggerModuleConfig,
      providers: [swaggerOptionsProvider],
      exports: [swaggerOptionsProvider],
    }
  }

  /**
   * 根据配置项构建 OpenAPI 配置对象
   * 供 main.ts 中调用 setupSwagger(app, config, path) 使用
   */
  static buildDocument(options: SwaggerConfigOptions) {
    return createSwaggerConfig(options)
  }
}
