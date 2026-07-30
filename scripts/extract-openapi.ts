/**
 * extract-openapi.ts — 离线提取所有微服务的 OpenAPI JSON
 *
 * 原理：
 *   1. 动态 import AppModule
 *   2. 通过 Reflect.getMetadata 递归扫描 @Module 装饰器的 controllers 数组
 *      （跳过 DatabaseModule/RedisModule 等需要真实连接的基础设施模块）
 *   3. 构建一个只包含 Controllers 的 MockModule
 *   4. NestFactory.create(MockModule) — app.init() 只实例化 providers，
 *      Controllers 是 lazy 的（请求时才实例化），所以无 DB 也能成功
 *   5. SwaggerModule.createDocument 只读取 @ApiTags/@ApiOperation/@ApiProperty
 *      装饰器元数据，不需要真实 Controller 实例
 *
 * 必须用 ts-node 运行（非 tsx）：
 *   esbuild (tsx) 不支持 emitDecoratorMetadata，无法生成 design:paramtypes，
 *   导致 Swagger 无法扫描 DTO schema。
 *   ts-node + CJS 模式完整支持 emitDecoratorMetadata。
 *
 * 输出：
 *   scripts/fixtures/<service>.openapi.json
 *
 * 用法：
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' -r tsconfig-paths/register scripts/extract-openapi.ts
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' -r tsconfig-paths/register scripts/extract-openapi.ts --service user
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'
import { createSwaggerConfig } from '@reelclone/swagger'
import { register as promRegister } from 'prom-client'

// CJS 模式下 __dirname 是 Node.js 自动提供的全局变量
const ROOT = path.resolve(__dirname, '..')

/** 服务元数据：模块路径 + Swagger 配置 */
interface ServiceMeta {
  /** 服务目录名（如 user-service） */
  dir: string
  /** AppModule 的相对路径（相对项目根，用于动态 import） */
  moduleRelative: string
  /** Swagger 配置 */
  swagger: {
    title: string
    description: string
    version: string
    tag: string
  }
}

const SERVICES: ServiceMeta[] = [
  {
    dir: 'user-service',
    moduleRelative: '../apps/user-service/src/app.module.ts',
    swagger: {
      title: 'User Service API',
      description: '用户服务：用户信息管理、绑定手机号、短信验证码、修改密码',
      version: '0.1.0',
      tag: 'user',
    },
  },
  {
    dir: 'asset-service',
    moduleRelative: '../apps/asset-service/src/app.module.ts',
    swagger: {
      title: 'Asset Service API',
      description: '素材服务：上传凭证、资产管理、数字人分组',
      version: '0.1.0',
      tag: 'asset',
    },
  },
  {
    dir: 'benchmark-service',
    moduleRelative: '../apps/benchmark-service/src/app.module.ts',
    swagger: {
      title: 'Benchmark Service API',
      description: '对标解析服务：短视频拆解、视觉/音频/OCR 分析、复刻建议',
      version: '0.1.0',
      tag: 'benchmark',
    },
  },
  {
    dir: 'billing-service',
    moduleRelative: '../apps/billing-service/src/app.module.ts',
    swagger: {
      title: 'Billing Service API',
      description: '计费服务：积分余额、流水、冻结/结算/释放/发放/奖励',
      version: '0.1.0',
      tag: 'billing',
    },
  },
  {
    dir: 'template-service',
    moduleRelative: '../apps/template-service/src/app.module.ts',
    swagger: {
      title: 'Template Service API',
      description: '模板服务：模板广场、上传转模板、审核、收藏、行业偏好',
      version: '0.1.0',
      tag: 'template',
    },
  },
  {
    dir: 'workbench-service',
    moduleRelative: '../apps/workbench-service/src/app.module.ts',
    swagger: {
      title: 'Workbench Service API',
      description: '工作台服务：作品管理、生成任务、复刻发布',
      version: '0.1.0',
      tag: 'workbench',
    },
  },
  {
    dir: 'notification-service',
    moduleRelative: '../apps/notification-service/src/app.module.ts',
    swagger: {
      title: 'Notification Service API',
      description: '通知服务：站内消息列表、未读数、标记已读',
      version: '0.1.0',
      tag: 'notification',
    },
  },
  {
    dir: 'order-service',
    moduleRelative: '../apps/order-service/src/app.module.ts',
    swagger: {
      title: 'Order Service API',
      description: '订单服务：下单、订单查询、套餐、微信支付回调',
      version: '0.1.0',
      tag: 'order',
    },
  },
  {
    dir: 'admin-service',
    moduleRelative: '../apps/admin-service/src/app.module.ts',
    swagger: {
      title: 'Admin Service API',
      description: '运营后台：用户/订单/套餐/审核/对账/统计/通知/内容/API Key 管理',
      version: '0.1.0',
      tag: 'admin',
    },
  },
]

/** 解析命令行参数 */
function parseArgs(): { service?: string } {
  const args = process.argv.slice(2)
  let service: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--service' || arg === '-s') {
      service = args[++i]
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          '用法: npx ts-node --transpile-only --compiler-options \'{"module":"commonjs"}\' -r tsconfig-paths/register scripts/extract-openapi.ts [选项]',
          '',
          '选项:',
          '  -s, --service <name>   仅提取指定服务（如 user-service 或 user）',
          '  -h, --help             显示帮助',
          '',
          '示例:',
          '  npm run extract:openapi -- --service user-service',
          '  npm run extract:openapi',
        ].join('\n'),
      )
      process.exit(0)
    }
  }
  return { service }
}

/** 规范化服务名 */
function normalizeServiceName(name: string): string {
  if (SERVICES.find((s) => s.dir === name)) return name
  const full = `${name}-service`
  if (SERVICES.find((s) => s.dir === full)) return full
  throw new Error(`未知服务名: ${name}。可用服务: ${SERVICES.map((s) => s.dir).join(', ')}`)
}

/**
 * 递归收集 Module 上的所有 Controllers
 *
 * 通过 Reflect.getMetadata 读取 @Module 装饰器元数据：
 *  - MODULE_METADATA.CONTROLLERS — 该模块注册的 Controllers
 *  - MODULE_METADATA.IMPORTS     — 子模块（递归扫描）
 *
 * 跳过的模块（不递归扫描其 imports）：
 *  - DatabaseModule / RedisModule / TypeOrmModule — 需要真实 DB 连接
 *  - LoggerModule / HealthModule / MetricsModule — 基础设施，无 Controllers
 *  - JwtModule / PassportModule / ConfigModule   — 第三方模块，无业务 Controllers
 */
const SKIP_MODULE_NAMES = new Set([
  'DatabaseModule',
  'RedisModule',
  'TypeOrmModule',
  'LoggerModule',
  'HealthModule',
  'MetricsModule',
  'JwtModule',
  'PassportModule',
  'ConfigModule',
  'ConfigStoreModule',
  'AuditLogModule',
  'BullModule',
  'ScheduleModule',
  'HttpModule',
])

/** Nest @Module 装饰器存储的 metadata keys（来自 @nestjs/common/constants） */
const MODULE_METADATA = {
  IMPORTS: 'imports',
  PROVIDERS: 'providers',
  CONTROLLERS: 'controllers',
} as const

/** 递归收集 Controllers */
function collectControllers(
  module: unknown,
  controllers: Set<unknown>,
  visited: Set<unknown>,
): void {
  // 处理 DynamicModule：{ module: SomeModule, ... }
  const targetModule = (module as { module?: unknown })?.module ?? module
  if (targetModule === null || targetModule === undefined) return
  if (typeof targetModule !== 'function' && typeof targetModule !== 'object') {
    return
  }
  if (visited.has(targetModule)) return
  visited.add(targetModule)

  // 跳过基础设施模块
  const name = (targetModule as { name?: string })?.name
  if (name && SKIP_MODULE_NAMES.has(name)) {
    return
  }

  // 读取 @Module 装饰器的 controllers
  const ctrlMeta = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, targetModule) as
    unknown[] | undefined
  if (ctrlMeta) {
    for (const c of ctrlMeta) {
      if (typeof c === 'function') {
        controllers.add(c)
      }
    }
  }

  // 递归扫描 imports
  const importsMeta = Reflect.getMetadata(MODULE_METADATA.IMPORTS, targetModule) as
    unknown[] | undefined
  if (importsMeta) {
    for (const imp of importsMeta) {
      collectControllers(imp, controllers, visited)
    }
  }
}

/**
 * 为 Controllers 的构造函数依赖生成 mock providers
 *
 * Nest 在 app.init() 时会实例化 controllers，需要解析构造函数依赖。
 * Swagger 只读取装饰器元数据，不需要真实 Service 实例。
 * 因此用 useValue: {} 提供 mock，让 DI 容器构建成功。
 *
 * 实现原理：
 *  1. 读取每个 Controller 的 design:paramtypes metadata（由 emitDecoratorMetadata 生成）
 *     + self:paramtypes（Nest @Inject token，如 TypeORM Repository 的字符串 token）
 *  2. 对每个参数类型/token，用 { provide: Type, useValue: {} } 注册为 provider
 *  3. 递归处理 Service 的构造函数依赖（2 层深度）
 */
function generateMockProviders(controllers: Set<unknown>): Array<{ provide: any; useValue: any }> {
  const providers: Array<{ provide: any; useValue: any }> = []
  const visited = new Set<unknown>()

  /** 递归收集一个类的构造函数依赖（类型 + @Inject token） */
  function collectDeps(target: unknown, depth: number): void {
    if (typeof target !== 'function') return
    if (depth > 2) return // 最多递归 2 层

    // design:paramtypes — 类型注入
    const paramTypes = Reflect.getMetadata('design:paramtypes', target) as unknown[] | undefined
    // self:paramtypes — Nest @Inject token（字符串/Symbol，如 TypeORM Repository token）
    // 注意：NestJS v10+ 格式为 ParamData[] = [{ index: number, param: token }, ...]
    // 兼容旧格式（直接 token 数组）和新格式（ParamData 数组）
    const injectTokensRaw = Reflect.getMetadata('self:paramtypes', target) as unknown[] | undefined

    // 归一化为 (token | undefined)[]，索引对齐到参数位置
    const injectTokens: (unknown | undefined)[] = []
    if (injectTokensRaw) {
      for (const item of injectTokensRaw) {
        if (item === null || item === undefined) continue
        // 新格式 ParamData：{ index, param }
        if (
          typeof item === 'object' &&
          'param' in (item as Record<string, unknown>) &&
          'index' in (item as Record<string, unknown>)
        ) {
          const pd = item as { index: number; param: unknown }
          injectTokens[pd.index] = pd.param
        } else {
          // 旧格式兜底：NestJS v10+ 实际都是 ParamData 格式
          injectTokens.push(item)
        }
      }
    }

    if (!paramTypes && !injectTokens.length) return

    const maxLen = Math.max(paramTypes?.length ?? 0, injectTokens.length)

    for (let i = 0; i < maxLen; i++) {
      // 优先用 @Inject token（如果有）
      const token = injectTokens[i]
      const type = paramTypes?.[i]

      const provideKey = token !== undefined ? token : type

      if (provideKey === undefined || provideKey === null) continue
      if (visited.has(provideKey)) continue
      visited.add(provideKey)

      // 跳过基础类型
      if (
        typeof provideKey === 'function' &&
        (provideKey === String ||
          provideKey === Number ||
          provideKey === Boolean ||
          provideKey === Array ||
          provideKey === Object ||
          provideKey === Promise)
      ) {
        continue
      }

      providers.push({ provide: provideKey, useValue: {} })

      // 如果是类类型，递归收集其依赖
      if (typeof provideKey === 'function') {
        collectDeps(provideKey, depth + 1)
      }
    }
  }

  for (const ctrl of controllers) {
    collectDeps(ctrl, 0)
  }

  return providers
}

/** 提取单个服务的 OpenAPI JSON */
async function extractService(meta: ServiceMeta): Promise<boolean> {
  console.log(`\n→ ${meta.dir}`)
  console.log(`  Module: ${meta.moduleRelative}`)

  try {
    // 清除 prom-client 全局 register，避免跨服务 collectDefaultMetrics 重复注册
    promRegister.clear()

    // 动态 require AppModule（CJS 模式）
    // 注意：用 createRequire 支持 .ts 扩展名（ts-node 注册了 loader）
    const modulePath = path.resolve(__dirname, meta.moduleRelative)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const moduleExports = require(modulePath)
    const AppModule = moduleExports.AppModule
    if (!AppModule) {
      throw new Error(`AppModule 未在 ${modulePath} 中导出`)
    }

    // 递归收集所有 Controllers（跳过基础设施模块）
    const controllers = new Set<unknown>()
    const visited = new Set<unknown>()
    collectControllers(AppModule, controllers, visited)

    if (controllers.size === 0) {
      throw new Error('未收集到任何 Controller')
    }

    console.log(`  Controllers: ${controllers.size}`)

    // 为 Controller 的依赖生成 mock providers（Service/Repository 等）
    const mockProviders = generateMockProviders(controllers)
    console.log(`  Mock Providers: ${mockProviders.length}`)

    // 构建轻量 MockModule：包含 Controllers + mock providers
    @Module({
      controllers: Array.from(controllers) as any[],
      providers: mockProviders,
    })
    class MockModule {}

    // 创建 app — 因为 MockModule 没有 providers，app.init() 不会触发 DB/Redis 连接
    const app = await NestFactory.create(MockModule, {
      abortOnError: false,
      logger: ['error'],
    })

    // 设置全局前缀（与 main.ts 一致，保证 OpenAPI 路径正确）
    app.setGlobalPrefix('api/v1')

    // 构建 Swagger 文档（只读取装饰器元数据，不需要真实 Controller 实例）
    const config = createSwaggerConfig({
      title: meta.swagger.title,
      description: meta.swagger.description,
      version: meta.swagger.version,
      tag: meta.swagger.tag,
    })
    const document = SwaggerModule.createDocument(app, config as any)

    await app.close()

    // 写入 fixture 文件
    const fixtureDir = path.join(ROOT, 'scripts', 'fixtures')
    await fs.mkdir(fixtureDir, { recursive: true })
    const filePath = path.join(fixtureDir, `${meta.dir}.openapi.json`)
    const jsonStr = JSON.stringify(document, null, 2)
    await fs.writeFile(filePath, jsonStr, 'utf8')

    const sourceHash = crypto.createHash('sha256').update(jsonStr).digest('hex').slice(0, 12)
    const pathsCount = Object.keys(document.paths || {}).length
    const schemasCount = Object.keys(document.components?.schemas || {}).length

    console.log(`  ✓ ${path.relative(ROOT, filePath)}`)
    console.log(`    Paths: ${pathsCount}  Schemas: ${schemasCount}  Hash: ${sourceHash}`)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ ${meta.dir} 提取失败: ${msg}`)
    if (err instanceof Error && err.stack) {
      console.error(`    ${err.stack.split('\n').slice(0, 5).join('\n    ')}`)
    }
    return false
  }
}

async function main(): Promise<void> {
  const { service } = parseArgs()

  const targets = service ? [normalizeServiceName(service)] : SERVICES.map((s) => s.dir)
  const metas = SERVICES.filter((m) => targets.includes(m.dir))

  console.log(`\n🚀 开始提取 OpenAPI JSON (${metas.length} 个服务)`)
  console.log('='.repeat(60))

  const succeeded: string[] = []
  for (const meta of metas) {
    const ok = await extractService(meta)
    if (ok) succeeded.push(meta.dir)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ 完成: ${succeeded.length}/${metas.length} 成功`)
  if (succeeded.length < metas.length) {
    const failed = metas.filter((m) => !succeeded.includes(m.dir)).map((m) => m.dir)
    console.log(`⚠ 失败: ${failed.join(', ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('❌ 提取失败:', err)
  process.exit(1)
})
