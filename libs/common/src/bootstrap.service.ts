/**
 * NestJS 微服务启动工厂函数
 *
 * 统一各业务服务 main.ts 中的样板代码：
 *  - failClosedStartupCheck（启动 profile 校验）
 *  - NestFactory.create（支持 bufferLogs / rawBody / logger 选项）
 *  - 全局前缀（默认 api/v1，排除 livez / readyz）
 *  - 全局 ValidationPipe + ResponseInterceptor + AllExceptionsFilter
 *  - CORS（默认 origin:true, credentials:true）
 *  - Swagger 文档（非生产环境自动挂载，通过 @reelclone/swagger 动态加载）
 *  - 端口监听（从环境变量读取，fallback 到 defaultPort）
 *  - 维齐的启动日志
 *
 * 各服务如有特殊需求（全局守卫、额外实例化等），
 * 可通过 configure 回调在标准设置之后、Swagger 之前执行自定义逻辑。
 */
import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'
import {
  INestApplication,
  Logger,
  type LogLevel,
  type LoggerService,
  type Type,
} from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'

import { AllExceptionsFilter } from './filters/all-exceptions.filter'
import { AppValidationPipe } from './pipes/validation.pipe'
import { ResponseInterceptor } from './interceptors/response.interceptor'
import { failClosedStartupCheck } from './config/startup-profile.validator'

// -------------------- 类型定义 --------------------

/** enableCors 方法接受的参数类型（从 INestApplication 签名提取，避免深层导入 CorsOptions） */
type AppCorsOptions = NonNullable<Parameters<INestApplication['enableCors']>[0]>

/** Swagger 启动配置 */
export interface SwaggerBootstrapOptions {
  /** 文档标题 */
  title: string
  /** 文档描述 */
  description: string
  /** API 版本号 */
  version: string
  /** 服务标签 */
  tag: string
  /** 挂载路径，默认 /api/docs */
  path?: string
}

/** bootstrapService 工厂选项 */
export interface BootstrapOptions {
  /** 服务名称（用于日志，如 'workbench-service'） */
  name: string
  /** 默认端口（环境变量未设置时使用） */
  defaultPort: number
  /** AppModule 类 */
  module: Type
  /** 全局前缀，默认 'api/v1'（排除 livez / readyz） */
  globalPrefix?: string
  /** CORS 配置，默认 { origin: true, credentials: true } */
  cors?: AppCorsOptions
  /** Swagger 配置（非生产环境自动挂载） */
  swagger?: SwaggerBootstrapOptions
  /** 是否启用 bufferLogs，默认 false */
  bufferLogs?: boolean
  /** 是否保留原始请求体（rawBody），默认 false */
  rawBody?: boolean
  /** NestFactory logger 选项 */
  logger?: false | LoggerService | LogLevel[]
  /** 端口环境变量名，默认 'PORT' */
  portEnvVar?: string
  /** 自定义配置回调（在全局 Pipe/Interceptor/Filter/CORS 之后、Swagger 之前执行） */
  configure?: (app: INestApplication) => void | Promise<void>
  /** 额外日志行（在标准启动日志之后输出） */
  extraLogs?: (port: number) => string[]
}

// -------------------- 工厂函数 --------------------

/**
 * NestJS 微服务启动工厂
 *
 * 封装各服务 main.ts 的通用启动流程，调用方只需提供服务名、端口、AppModule
 * 及可选的 Swagger 配置即可。
 *
 * @example
 * ```ts
 * import { bootstrapService } from '@reelclone/common'
 * import { AppModule } from './app.module'
 *
 * void bootstrapService({
 *   name: 'workbench-service',
 *   defaultPort: 3007,
 *   module: AppModule,
 *   swagger: { title: 'Workbench Service API', description: '工作台服务', version: '0.1.0', tag: 'workbench' },
 * })
 * ```
 */
export async function bootstrapService(options: BootstrapOptions): Promise<void> {
  const {
    name,
    defaultPort,
    module,
    globalPrefix = 'api/v1',
    cors = { origin: true, credentials: true },
    swagger,
    bufferLogs = false,
    rawBody = false,
    logger: loggerOption,
    portEnvVar = 'PORT',
    configure,
    extraLogs,
  } = options

  // 1. 启动 profile 校验（fail closed）
  failClosedStartupCheck()

  // 2. 创建 NestJS 应用
  const nestOptions: {
    bufferLogs?: boolean
    rawBody?: boolean
    logger?: false | LoggerService | LogLevel[]
  } = {}
  if (bufferLogs) nestOptions.bufferLogs = true
  if (rawBody) nestOptions.rawBody = true
  if (loggerOption !== undefined) nestOptions.logger = loggerOption

  const app = await NestFactory.create<NestExpressApplication>(module, nestOptions)

  // Express 5 默认 simple 查询解析器不支持嵌套对象/数组；
  // 统一恢复 v4 的 extended 行为，避免 @Query DTO 绑定行为回归
  app.set('query parser', 'extended')

  // 3. 全局前缀（/livez、/readyz 健康检查端点排除）
  app.setGlobalPrefix(globalPrefix, {
    exclude: ['livez', 'readyz'],
  })

  // 4. 全局 Pipe / Interceptor / Filter
  app.useGlobalPipes(AppValidationPipe)
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  // 5. CORS
  app.enableCors(cors)

  // 6. 自定义配置（全局守卫、额外实例化等）
  if (configure) {
    await configure(app)
  }

  // 7. Swagger 文档（非生产环境挂载，可通过 SWAGGER_ENABLED=false 跳过）
  const nodeEnv = process.env.NODE_ENV || 'development'
  if (swagger && nodeEnv !== 'production' && process.env.SWAGGER_ENABLED !== 'false') {
    // 动态导入避免 @reelclone/common → @reelclone/swagger 循环依赖
    const { createSwaggerConfig, setupSwagger } = await import('@reelclone/swagger')
    const swaggerConfig = createSwaggerConfig({
      title: swagger.title,
      description: swagger.description,
      version: swagger.version,
      tag: swagger.tag,
    })
    setupSwagger(app, swaggerConfig, swagger.path ?? '/api/docs')
  }

  // 8. 监听端口
  const port = parseInt(process.env[portEnvVar] || String(defaultPort), 10)
  await app.listen(port)

  // 9. 启动日志
  const log = new Logger(name)
  log.log(`${name} listening on http://localhost:${port}`)
  if (swagger && nodeEnv !== 'production') {
    const docsPath = swagger.path ?? '/api/docs'
    log.log(`  → Swagger UI:  http://localhost:${port}${docsPath}`)
    log.log(`  → OpenAPI JSON: http://localhost:${port}${docsPath}-json`)
  }
  if (extraLogs) {
    for (const line of extraLogs(port)) {
      log.log(line)
    }
  }
}
