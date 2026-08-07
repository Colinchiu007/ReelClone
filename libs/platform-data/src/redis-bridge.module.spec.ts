import { OBS_REDIS_CLIENT } from '@reelclone/observability'
import { REDIS_CLIENT as DB_REDIS_CLIENT } from '@reelclone/database'
import { REDIS_CLIENT as COMMON_REDIS_CLIENT } from '@reelclone/common'
import { RedisBridgeModule } from './redis-bridge.module'

describe('RedisBridgeModule', () => {
  it('forRoot() 应返回 DynamicModule', () => {
    const mod = RedisBridgeModule.forRoot()
    expect(mod).toBeDefined()
    expect(mod.module).toBe(RedisBridgeModule)
    expect(mod.providers).toBeDefined()
    expect(mod.exports).toBeDefined()
  })

  it('forRoot() 应导出 2 个桥接 provider', () => {
    const mod = RedisBridgeModule.forRoot()
    // 2 个 provider：OBS_REDIS_CLIENT + common REDIS_CLIENT
    expect((mod.providers ?? []).length).toBe(2)
    // providers 应与 exports 相同
    expect(mod.exports).toEqual(mod.providers)
  })

  it('桥接 provider 应将 OBS_REDIS_CLIENT 指向 database REDIS_CLIENT', () => {
    const mod = RedisBridgeModule.forRoot()
    const providers = (mod.providers ?? []) as any[]
    const obsProvider = providers.find((p) => p.provide === OBS_REDIS_CLIENT)
    expect(obsProvider).toBeDefined()
    expect(obsProvider.useExisting).toBe(DB_REDIS_CLIENT)
  })

  it('桥接 provider 应将 common REDIS_CLIENT 指向 database REDIS_CLIENT', () => {
    const mod = RedisBridgeModule.forRoot()
    const providers = (mod.providers ?? []) as any[]
    const commonProvider = providers.find((p) => p.provide === COMMON_REDIS_CLIENT)
    expect(commonProvider).toBeDefined()
    expect(commonProvider.useExisting).toBe(DB_REDIS_CLIENT)
  })

  it('OBS_REDIS_CLIENT 应为 Symbol', () => {
    expect(typeof OBS_REDIS_CLIENT).toBe('symbol')
  })

  it('database REDIS_CLIENT 应为 Symbol', () => {
    expect(typeof DB_REDIS_CLIENT).toBe('symbol')
  })

  it('common REDIS_CLIENT 应为 Symbol', () => {
    expect(typeof COMMON_REDIS_CLIENT).toBe('symbol')
  })

  it('database REDIS_CLIENT 和 common REDIS_CLIENT 应为不同 Symbol', () => {
    expect(DB_REDIS_CLIENT).not.toBe(COMMON_REDIS_CLIENT)
  })
})
