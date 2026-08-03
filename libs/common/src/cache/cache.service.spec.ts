import { Test, TestingModule } from '@nestjs/testing'
import { CacheService } from './cache.service'
import { CACHE_REDIS } from './cache.constants'

describe('CacheService', () => {
  let service: CacheService
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    exists: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService, { provide: CACHE_REDIS, useValue: mockRedis }],
    }).compile()

    service = module.get(CacheService)
  })

  describe('getOrSet', () => {
    it('命中缓存时直接返回，不调用 fetchFn', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ id: 1, name: 'cached' }))

      const fetchFn = jest.fn()
      const result = await service.getOrSet('key1', 60, fetchFn)

      expect(result).toEqual({ id: 1, name: 'cached' })
      expect(fetchFn).not.toHaveBeenCalled()
      expect(mockRedis.get).toHaveBeenCalledWith('key1')
    })

    it('缓存未命中时执行 fetchFn 并回填', async () => {
      mockRedis.get.mockResolvedValue(null)
      mockRedis.set.mockResolvedValue('OK')

      const fetchFn = jest.fn().mockResolvedValue({ id: 2, name: 'fresh' })
      const result = await service.getOrSet('key2', 120, fetchFn)

      expect(result).toEqual({ id: 2, name: 'fresh' })
      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(mockRedis.set).toHaveBeenCalledWith(
        'key2',
        JSON.stringify({ id: 2, name: 'fresh' }),
        'EX',
        120,
      )
    })

    it('ttl=0 时不设过期', async () => {
      mockRedis.get.mockResolvedValue(null)
      mockRedis.set.mockResolvedValue('OK')

      const fetchFn = jest.fn().mockResolvedValue('data')
      await service.getOrSet('key3', 0, fetchFn)

      expect(mockRedis.set).toHaveBeenCalledWith('key3', JSON.stringify('data'))
    })

    it('缓存读取失败时降级到 fetchFn', async () => {
      mockRedis.get.mockRejectedValue(new Error('CONNECTION_REFUSED'))
      mockRedis.set.mockResolvedValue('OK')

      const fetchFn = jest.fn().mockResolvedValue('fallback')
      const result = await service.getOrSet('key4', 60, fetchFn)

      expect(result).toBe('fallback')
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('get', () => {
    it('返回反序列化值', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ a: 1 }))
      expect(await service.get('k')).toEqual({ a: 1 })
    })

    it('key 不存在返回 null', async () => {
      mockRedis.get.mockResolvedValue(null)
      expect(await service.get('k')).toBeNull()
    })

    it('读取异常返回 null', async () => {
      mockRedis.get.mockRejectedValue(new Error('err'))
      expect(await service.get('k')).toBeNull()
    })
  })

  describe('set', () => {
    it('带 TTL 写入', async () => {
      mockRedis.set.mockResolvedValue('OK')
      await service.set('k', { v: 1 }, 300)
      expect(mockRedis.set).toHaveBeenCalledWith('k', '{"v":1}', 'EX', 300)
    })

    it('不带 TTL 写入', async () => {
      mockRedis.set.mockResolvedValue('OK')
      await service.set('k', 'val')
      expect(mockRedis.set).toHaveBeenCalledWith('k', JSON.stringify('val'))
    })
  })

  describe('del', () => {
    it('删除 key', async () => {
      mockRedis.del.mockResolvedValue(1)
      await service.del('k')
      expect(mockRedis.del).toHaveBeenCalledWith('k')
    })
  })

  describe('invalidate', () => {
    it('SCAN + DEL 批量失效', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['a:1', 'a:2']])

      const count = await service.invalidate('a:*')
      expect(count).toBe(2)
      expect(mockRedis.del).toHaveBeenCalledWith('a:1', 'a:2')
    })

    it('多轮 SCAN 处理大量 key', async () => {
      mockRedis.scan.mockResolvedValueOnce(['42', ['k1']]).mockResolvedValueOnce(['0', ['k2']])

      const count = await service.invalidate('k*')
      expect(count).toBe(2)
    })
  })

  describe('exists', () => {
    it('key 存在返回 true', async () => {
      mockRedis.exists.mockResolvedValue(1)
      expect(await service.exists('k')).toBe(true)
    })

    it('key 不存在返回 false', async () => {
      mockRedis.exists.mockResolvedValue(0)
      expect(await service.exists('k')).toBe(false)
    })
  })
})
