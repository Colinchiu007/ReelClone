import { OBS_REDIS_CLIENT } from '@reelclone/observability'
import { REDIS_CLIENT } from '@reelclone/database'
import { RedisBridgeModule } from './redis-bridge.module'

describe('RedisBridgeModule', () => {
  it('forRoot() 应返回 DynamicModule', () => {
    const mod = RedisBridgeModule.forRoot()
    expect(mod).toBeDefined()
    expect(mod.module).toBe(RedisBridgeModule)
    expect(mod.providers).toBeDefined()
    expect(mod.exports).toBeDefined()
  })

  it('forRoot() 应导出桥接 provider', () => {
    const mod = RedisBridgeModule.forRoot()
    // 应有一个 provider
    expect((mod.providers ?? []).length).toBe(1)
    // provider 应与 export 相同
    expect(mod.exports).toEqual(mod.providers)
  })

  it('桥接 provider 应将 OBS_REDIS_CLIENT 指向 REDIS_CLIENT', () => {
    const mod = RedisBridgeModule.forRoot()
    const provider = (mod.providers ?? [])[0] as any
    expect(provider.provide).toBe(OBS_REDIS_CLIENT)
    expect(provider.useExisting).toBe(REDIS_CLIENT)
  })

  it('OBS_REDIS_CLIENT 应为 Symbol', () => {
    expect(typeof OBS_REDIS_CLIENT).toBe('symbol')
  })

  it('REDIS_CLIENT 应为 Symbol', () => {
    expect(typeof REDIS_CLIENT).toBe('symbol')
  })
})
