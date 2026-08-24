import { TypeOrmModule } from '@nestjs/typeorm'

import {
  DatabaseModule,
  buildDataSourceOptions,
  DATABASE_CONNECTIONS,
  MAIN_ENTITIES,
  BILLING_ENTITIES,
  TEMPLATE_ENTITIES,
  BENCHMARK_ENTITIES,
} from '../database.module'
import { RedisModule, REDIS_CLIENT } from '../redis.module'
import { User } from '../../entities/user.entity'

describe('DatabaseModule', () => {
  describe('DATABASE_CONNECTIONS', () => {
    it('defines the 4 expected connections', () => {
      expect(DATABASE_CONNECTIONS).toEqual({
        MAIN: 'main',
        BILLING: 'billing',
        TEMPLATE: 'template',
        BENCHMARK: 'benchmark',
      })
    })
  })

  describe('entity lists', () => {
    it('MAIN_ENTITIES contains core main-db entities', () => {
      expect(MAIN_ENTITIES).toContain(User)
      for (const required of ['User', 'Order', 'Work', 'Package', 'UserPackage', 'Notification']) {
        expect(MAIN_ENTITIES.map((e) => e.name)).toContain(required)
      }
    })

    it('billing/template/benchmark entity lists are scoped correctly', () => {
      expect(BILLING_ENTITIES.map((e) => e.name)).toEqual(['PointTransaction'])
      expect(TEMPLATE_ENTITIES.map((e) => e.name).sort()).toEqual(['Favorite', 'Template'])
      expect(BENCHMARK_ENTITIES.map((e) => e.name)).toEqual(['Benchmark'])
    })
  })

  describe('buildDataSourceOptions', () => {
    it('returns a postgres DataSourceOptions with snake naming and no synchronize', () => {
      const opts = buildDataSourceOptions('reelclone_main', MAIN_ENTITIES)
      expect(opts.type).toBe('postgres')
      expect(opts.database).toBe('reelclone_main')
      expect(opts.entities).toBe(MAIN_ENTITIES)
      expect((opts as { synchronize?: boolean }).synchronize).toBe(false)
      expect(opts.namingStrategy).toBeDefined()
    })

    it('reads host/port/user/password from env with sensible defaults', () => {
      const prev = { ...process.env }
      try {
        delete process.env.DATABASE_HOST
        delete process.env.DATABASE_PORT
        delete process.env.DATABASE_USER
        delete process.env.DATABASE_PASSWORD
        const opts = buildDataSourceOptions('db', []) as unknown as Record<string, unknown>
        expect(opts.host).toBe('localhost')
        expect(opts.port).toBe(5432)
        expect(opts.username).toBe('reelclone')
        expect(opts.password).toBe('reelclone_dev')
      } finally {
        process.env = prev
      }
    })

    it('uses env-provided host/port/user/password when set', () => {
      const prev = { ...process.env }
      try {
        process.env.DATABASE_HOST = 'db.internal'
        process.env.DATABASE_PORT = '5433'
        process.env.DATABASE_USER = 'admin'
        process.env.DATABASE_PASSWORD = 'secret'
        const opts = buildDataSourceOptions('db', []) as unknown as Record<string, unknown>
        expect(opts.host).toBe('db.internal')
        expect(opts.port).toBe(5433)
        expect(opts.username).toBe('admin')
        expect(opts.password).toBe('secret')
      } finally {
        process.env = prev
      }
    })
  })

  describe('forRoot', () => {
    it('returns a DynamicModule importing TypeOrmModule for all connections by default', () => {
      const mod = DatabaseModule.forRoot() as {
        module: unknown
        imports: unknown[]
        exports: unknown[]
      }
      expect(mod.module).toBe(DatabaseModule)
      expect(mod.imports.length).toBe(4)
      expect(mod.imports[0]).toBeDefined()
      expect(mod.exports).toContain(TypeOrmModule)
    })

    it('forRoot with connections list only builds requested connections', () => {
      const mod = DatabaseModule.forRoot({ connections: ['main'] }) as { imports: unknown[] }
      expect(mod.imports.length).toBe(1)
    })
  })

  describe('forFeature', () => {
    it('delegates to TypeOrmModule.forFeature', () => {
      const out = DatabaseModule.forFeature([User], 'main')
      expect(out).toBeDefined()
      expect((out as { module?: unknown }).module).toBeDefined()
    })
  })
})

describe('RedisModule', () => {
  it('forRoot returns DynamicModule exposing REDIS_CLIENT provider', () => {
    const mod = RedisModule.forRoot() as {
      module: unknown
      providers?: Array<{ provide: unknown; useFactory: (...args: unknown[]) => unknown }>
      exports?: unknown[]
    }
    expect(mod.module).toBe(RedisModule)
    expect(mod.providers?.length).toBe(1)
    expect(mod.providers?.[0].provide).toBe(REDIS_CLIENT)
    expect(typeof mod.providers?.[0].useFactory).toBe('function')
    expect(Array.isArray(mod.exports)).toBe(true)
    expect(mod.exports?.length).toBe(1)
    expect((mod.exports?.[0] as { provide?: unknown })?.provide).toBe(REDIS_CLIENT)
  })

  it('forRoot exposes a useFactory provider', () => {
    const mod = RedisModule.forRoot({ host: 'redis.internal', port: 6380, keyPrefix: 'p' })
    const factory = (
      mod as { providers?: Array<{ useFactory: (opts?: Record<string, unknown>) => unknown }> }
    ).providers?.[0].useFactory
    expect(factory).toBeDefined()
  })
})
