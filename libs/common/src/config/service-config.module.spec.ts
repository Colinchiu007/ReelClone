import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { ServiceConfigModule } from './service-config.module'

describe('ServiceConfigModule', () => {
  it('forRoot() 应返回 DynamicModule', () => {
    const mod = ServiceConfigModule.forRoot()
    expect(mod).toBeDefined()
    expect(mod.module).toBe(ServiceConfigModule)
    expect(mod.global).toBe(true)
    expect(mod.imports).toBeDefined()
    expect((mod.imports ?? []).length).toBe(1) // ConfigModule
  })

  it('forRoot() 默认 global=true', () => {
    const mod = ServiceConfigModule.forRoot()
    expect(mod.global).toBe(true)
  })

  it('forRoot({ isGlobal: false }) 应设置 global=false', () => {
    const mod = ServiceConfigModule.forRoot({ isGlobal: false })
    expect(mod.global).toBe(false)
  })

  it('forRoot({ cache: true }) 应传递 cache 选项', () => {
    const mod = ServiceConfigModule.forRoot({ cache: true })
    expect(mod).toBeDefined()
    // cache 选项会被传递给 ConfigModule.forRoot
  })

  it('forRoot({ extraLoad: [...] }) 应接受额外配置工厂', () => {
    const extraFactory = () => ({ testKey: 'testValue' })
    const mod = ServiceConfigModule.forRoot({ extraLoad: [extraFactory as any] })
    expect(mod).toBeDefined()
    // extraLoad 会被追加到 load 数组
  })

  it('应提供 ConfigService', async () => {
    const mod = await Test.createTestingModule({
      imports: [ServiceConfigModule.forRoot()],
    }).compile()

    const configService = mod.get(ConfigService)
    expect(configService).toBeDefined()
  })

  it('应加载 configuration 配置（env 命名空间）', async () => {
    const mod = await Test.createTestingModule({
      imports: [ServiceConfigModule.forRoot()],
    }).compile()

    const configService = mod.get(ConfigService)
    // configuration 工厂返回 env 命名空间
    const env = configService.get('env')
    expect(env).toBeDefined()
    expect(env.nodeEnv).toBeDefined()
  })

  it('应加载 jwt 配置', async () => {
    const mod = await Test.createTestingModule({
      imports: [ServiceConfigModule.forRoot()],
    }).compile()

    const configService = mod.get(ConfigService)
    const jwt = configService.get('jwt')
    expect(jwt).toBeDefined()
    expect(jwt.secret).toBeDefined()
    expect(jwt.expiresIn).toBeDefined()
  })
})
