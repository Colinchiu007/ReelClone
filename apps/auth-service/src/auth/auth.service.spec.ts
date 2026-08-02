/**
 * AuthService 单元测试
 *
 * 覆盖场景：
 *  - wxLogin
 *    · 新用户（首次注册）
 *    · 老用户（更新 lastLoginAt）
 *    · Mock 模式（无需真实微信凭证）
 *    · 用户被冻结（应抛 FORBIDDEN）
 *  - adminLogin
 *    · 登录成功（mobile + password 匹配 + role=ADMIN）
 *    · 用户不存在 → UnauthorizedException
 *    · 密码错误 → UnauthorizedException
 *    · 非管理员 → ForbiddenException
 *    · 账号冻结 → ForbiddenException
 *  - refreshToken
 *    · 成功（verify 通过 & 不在黑名单）
 *    · 失败（verify 抛错）
 *    · 失败（jti 在黑名单）
 *  - logout
 *    · 正常写入黑名单（带 TTL）
 *    · 已过期 Token 跳过写入
 *    · 无 jti 幂等返回
 */
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import type { Redis } from 'ioredis'
import { User, UserStatus, UserRole, REDIS_CLIENT } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { AuthService } from './auth.service'
import { WechatService, type WechatSession } from './wechat.service'
import { JwtCustomService, type JwtPayload } from './jwt.service'
import type { WechatLoginDto } from './dto/wechat-login.dto'
import type { AdminLoginDto } from './dto/admin-login.dto'

// Mock bcrypt，避免在单测中执行真实哈希计算
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}))

// -------------------- Mock 工厂 --------------------

/** 构造一个 User 实体 */
function mockUser(overrides: Partial<User> = {}): User {
  const user = new User()
  user.id = overrides.id ?? 'user-uuid-001'
  user.openId = overrides.openId ?? 'openid_abc'
  user.unionId = overrides.unionId ?? null
  user.mobile = overrides.mobile ?? null
  user.password = overrides.password ?? null
  user.nickname = overrides.nickname ?? 'tester'
  user.avatarUrl = overrides.avatarUrl ?? null
  user.email = overrides.email ?? null
  user.currentPoints = overrides.currentPoints ?? 0
  user.totalPoints = overrides.totalPoints ?? 0
  user.industryPreferences = overrides.industryPreferences ?? []
  user.status = overrides.status ?? UserStatus.ACTIVE
  user.role = overrides.role ?? UserRole.USER
  user.lastLoginAt = overrides.lastLoginAt ?? null
  user.tokenVersion = overrides.tokenVersion ?? 0
  user.createdAt = overrides.createdAt ?? new Date('2024-01-01T00:00:00Z')
  user.updatedAt = overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z')
  return user
}

/** 模拟 Repository */
function mockRepo(): jest.Mocked<Repository<User>> {
  return {
    findOne: jest.fn(),
    create: jest.fn((entity: DeepPartial<User>) => ({ ...entity }) as User),
    save: jest.fn(async (entity: User) => entity),
  } as unknown as jest.Mocked<Repository<User>>
}

/** 模拟 Redis 客户端 */
function mockRedis(): jest.Mocked<Redis> {
  const pipelineOps = {
    set: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn(async () => []),
  }
  const pipeline = {
    set: jest.fn(() => pipelineOps),
    sadd: jest.fn(() => pipelineOps),
    expire: jest.fn(() => pipelineOps),
    exec: jest.fn(async () => []),
  }
  return {
    exists: jest.fn(async () => 0),
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
    del: jest.fn(async () => 0),
    smembers: jest.fn(async () => []),
    pipeline: jest.fn(() => pipeline),
  } as unknown as jest.Mocked<Redis>
}

/** 模拟 WechatService */
function mockWechatService(session: WechatSession): jest.Mocked<WechatService> {
  return {
    code2session: jest.fn(async () => session),
    isMockMode: jest.fn(() => true),
  } as unknown as jest.Mocked<WechatService>
}

/** 模拟 JwtCustomService */
function mockJwtCustomService(): jest.Mocked<JwtCustomService> {
  return {
    signAccessToken: jest.fn(() => 'access-token-mock'),
    signRefreshToken: jest.fn(() => 'refresh-token-mock'),
    signTokenPair: jest.fn(() => ({
      accessToken: 'access-token-mock',
      refreshToken: 'refresh-token-mock',
    })),
    verify: jest.fn(),
    decode: jest.fn(),
  } as unknown as jest.Mocked<JwtCustomService>
}

// DeepPartial 类型用于 create() mock
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// -------------------- 测试 --------------------

describe('AuthService', () => {
  let service: AuthService
  let userRepo: jest.Mocked<Repository<User>>
  let redis: jest.Mocked<Redis>
  let wechatService: jest.Mocked<WechatService>
  let jwtService: jest.Mocked<JwtCustomService>

  beforeEach(async () => {
    userRepo = mockRepo()
    redis = mockRedis()
    wechatService = mockWechatService({
      openid: 'openid_abc',
      sessionKey: 'session_key_xxx',
      unionid: null,
    })
    jwtService = mockJwtCustomService()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User, 'main'), useValue: userRepo },
        { provide: WechatService, useValue: wechatService },
        { provide: JwtCustomService, useValue: jwtService },
        { provide: REDIS_CLIENT, useValue: redis },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NEW_USER_BONUS_POINTS') return '100'
              return undefined
            }),
          },
        },
      ],
    }).compile()

    service = module.get(AuthService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- wxLogin --------------------

  describe('wxLogin', () => {
    const dto: WechatLoginDto = {
      code: 'wx-code-001',
      nickname: '小白',
      avatarUrl: 'https://example.com/a.png',
    }

    it('新用户：应创建用户并返回 isNewUser=true', async () => {
      // findOne 返回 null（不存在）
      userRepo.findOne.mockResolvedValueOnce(null)
      // create 返回一个 User
      const newUser = mockUser({
        id: 'new-user-id',
        openId: 'openid_abc',
        nickname: '小白',
      })
      userRepo.create.mockReturnValueOnce(newUser)
      userRepo.save.mockResolvedValueOnce(newUser)

      const result = await service.wxLogin(dto)

      expect(wechatService.code2session).toHaveBeenCalledWith('wx-code-001')
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { openId: 'openid_abc' },
      })
      expect(userRepo.create).toHaveBeenCalled()
      expect(userRepo.save).toHaveBeenCalled()
      expect(jwtService.signTokenPair).toHaveBeenCalledWith(
        'new-user-id',
        'openid_abc',
        UserRole.USER,
        0,
        expect.any(String),
      )
      expect(result.isNewUser).toBe(true)
      expect(result.accessToken).toBe('access-token-mock')
      expect(result.refreshToken).toBe('refresh-token-mock')
      expect(result.user.id).toBe('new-user-id')
      expect(result.user.openId).toBe('openid_abc')
      expect(result.user.nickname).toBe('小白')
      // 验证新用户赠送积分（ConfigService mock 返回 '100'）
      const createArg = userRepo.create.mock.calls[0][0] as Partial<User>
      expect(createArg.currentPoints).toBe(100)
      expect(createArg.totalPoints).toBe(100)
    })

    it('老用户：应更新 lastLoginAt 并返回 isNewUser=false', async () => {
      const existing = mockUser({
        id: 'existing-id',
        openId: 'openid_abc',
        nickname: 'old-name',
        lastLoginAt: null,
      })
      userRepo.findOne.mockResolvedValueOnce(existing)
      userRepo.save.mockResolvedValueOnce({
        ...existing,
        lastLoginAt: expect.any(Date),
        nickname: '小白',
        avatarUrl: 'https://example.com/a.png',
      } as User)

      const result = await service.wxLogin(dto)

      expect(userRepo.create).not.toHaveBeenCalled()
      expect(userRepo.save).toHaveBeenCalled()
      expect(result.isNewUser).toBe(false)
      expect(result.user.id).toBe('existing-id')
    })

    it('Mock 模式：wechatService.code2session 返回 mock openid', async () => {
      wechatService.code2session.mockResolvedValueOnce({
        openid: 'mock_openid_abc',
        sessionKey: 'mock_session_key',
        unionid: null,
      })
      userRepo.findOne.mockResolvedValueOnce(null)
      const newUser = mockUser({ openId: 'mock_openid_abc' })
      userRepo.create.mockReturnValueOnce(newUser)
      userRepo.save.mockResolvedValueOnce(newUser)

      const result = await service.wxLogin({ code: 'mock-code' })

      expect(result.user.openId).toBe('mock_openid_abc')
      expect(wechatService.isMockMode()).toBe(true)
    })

    it('用户被冻结：应抛 FORBIDDEN 异常', async () => {
      const frozen = mockUser({
        id: 'frozen-id',
        openId: 'openid_abc',
        status: UserStatus.FROZEN,
      })
      userRepo.findOne.mockResolvedValueOnce(frozen)
      userRepo.save.mockResolvedValueOnce(frozen)

      await expect(service.wxLogin(dto)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
      })
    })

    it('未传 nickname：新用户使用默认昵称', async () => {
      userRepo.findOne.mockResolvedValueOnce(null)
      const newUser = mockUser({ nickname: '用户_abc' })
      userRepo.create.mockReturnValueOnce(newUser)
      userRepo.save.mockResolvedValueOnce(newUser)

      await service.wxLogin({ code: 'c', nickname: undefined })

      // create 入参应包含默认昵称
      const createArg = userRepo.create.mock.calls[0][0] as Partial<User>
      expect(createArg.nickname).toMatch(/^用户.+/)
    })
  })

  // -------------------- adminLogin --------------------

  describe('adminLogin', () => {
    const hashedPassword = '$2b$10$mockHashedPasswordForTestingOnly'
    const dto: AdminLoginDto = {
      mobile: '13800138000',
      password: 'secret123',
    }
    const bcryptCompare = bcrypt.compare as unknown as jest.Mock<Promise<boolean>, [string, string]>

    beforeEach(() => {
      // 默认 mock bcrypt.compare 返回 true（被覆盖时按需 mock）
      bcryptCompare.mockResolvedValue(true)
    })

    it('登录成功：mobile + password 匹配 + role=ADMIN', async () => {
      const admin = mockUser({
        id: 'admin-id',
        mobile: '13800138000',
        password: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nickname: '管理员小明',
        openId: 'openid_admin',
      })
      userRepo.findOne.mockResolvedValueOnce(admin)
      userRepo.save.mockResolvedValueOnce(admin)

      const result = await service.adminLogin(dto)

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { mobile: '13800138000' },
      })
      expect(bcryptCompare).toHaveBeenCalledWith('secret123', hashedPassword)
      expect(userRepo.save).toHaveBeenCalled()
      expect(jwtService.signTokenPair).toHaveBeenCalledWith(
        'admin-id',
        'openid_admin',
        UserRole.ADMIN,
        0,
        expect.any(String),
      )
      expect(result.accessToken).toBe('access-token-mock')
      expect(result.refreshToken).toBe('refresh-token-mock')
      expect(result.user).toEqual({
        id: 'admin-id',
        nickname: '管理员小明',
        role: UserRole.ADMIN,
      })
    })

    it('用户不存在：抛 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.adminLogin(dto)).rejects.toBeInstanceOf(UnauthorizedException)
      expect(bcryptCompare).not.toHaveBeenCalled()
      expect(jwtService.signTokenPair).not.toHaveBeenCalled()
    })

    it('用户未设置密码：抛 UnauthorizedException', async () => {
      const noPwdUser = mockUser({
        mobile: '13800138000',
        password: null,
        role: UserRole.ADMIN,
      })
      userRepo.findOne.mockResolvedValueOnce(noPwdUser)

      await expect(service.adminLogin(dto)).rejects.toBeInstanceOf(UnauthorizedException)
      expect(bcryptCompare).not.toHaveBeenCalled()
    })

    it('密码错误：抛 UnauthorizedException', async () => {
      const admin = mockUser({
        mobile: '13800138000',
        password: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      })
      userRepo.findOne.mockResolvedValueOnce(admin)
      bcryptCompare.mockResolvedValueOnce(false)

      await expect(service.adminLogin(dto)).rejects.toBeInstanceOf(UnauthorizedException)
      expect(jwtService.signTokenPair).not.toHaveBeenCalled()
      expect(userRepo.save).not.toHaveBeenCalled()
    })

    it('非管理员：抛 ForbiddenException', async () => {
      const normalUser = mockUser({
        mobile: '13800138000',
        password: hashedPassword,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      })
      userRepo.findOne.mockResolvedValueOnce(normalUser)

      await expect(service.adminLogin(dto)).rejects.toBeInstanceOf(ForbiddenException)
      // 角色校验在密码校验之前，bcrypt 不应被调用
      expect(bcryptCompare).not.toHaveBeenCalled()
      expect(jwtService.signTokenPair).not.toHaveBeenCalled()
    })

    it('账号冻结：抛 ForbiddenException', async () => {
      const frozenAdmin = mockUser({
        mobile: '13800138000',
        password: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.FROZEN,
      })
      userRepo.findOne.mockResolvedValueOnce(frozenAdmin)

      await expect(service.adminLogin(dto)).rejects.toBeInstanceOf(ForbiddenException)
      // 状态校验在密码校验之前，bcrypt 不应被调用
      expect(bcryptCompare).not.toHaveBeenCalled()
      expect(jwtService.signTokenPair).not.toHaveBeenCalled()
    })

    it('SUPER_ADMIN 也可登录', async () => {
      const superAdmin = mockUser({
        id: 'super-id',
        mobile: '13800138000',
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        nickname: '超管',
        openId: 'openid_super',
      })
      userRepo.findOne.mockResolvedValueOnce(superAdmin)
      userRepo.save.mockResolvedValueOnce(superAdmin)

      const result = await service.adminLogin(dto)

      expect(jwtService.signTokenPair).toHaveBeenCalledWith(
        'super-id',
        'openid_super',
        UserRole.SUPER_ADMIN,
        0,
        expect.any(String),
      )
      expect(result.user.role).toBe(UserRole.SUPER_ADMIN)
    })
  })

  // -------------------- refreshToken --------------------

  describe('refreshToken', () => {
    it('成功：返回新的 Token 对', async () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        openId: 'openid_x',
        jti: 'jti-1',
        type: 'refresh',
        role: UserRole.ADMIN,
        tokenVersion: 0,
        familyId: 'family-old',
      }
      jwtService.verify.mockReturnValueOnce(payload)
      redis.exists.mockResolvedValueOnce(0)

      const result = await service.refreshToken('valid-refresh')

      expect(jwtService.verify).toHaveBeenCalledWith('valid-refresh')
      expect(jwtService.signTokenPair).toHaveBeenCalledWith(
        'user-1',
        'openid_x',
        UserRole.ADMIN,
        0,
        expect.any(String),
      )
      expect(result.accessToken).toBe('access-token-mock')
      expect(result.refreshToken).toBe('refresh-token-mock')
    })

    it('失败：verify 抛错时转为 UNAUTHORIZED', async () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('jwt malformed')
      })

      await expect(service.refreshToken('bad-token')).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      })
    })

    it('失败：jti 在黑名单中应抛 UNAUTHORIZED', async () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        openId: 'openid_x',
        jti: 'jti-blacklisted',
        type: 'refresh',
      }
      jwtService.verify.mockReturnValueOnce(payload)
      redis.exists.mockResolvedValueOnce(1)

      await expect(service.refreshToken('blacklisted')).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      })
    })
  })

  // -------------------- logout --------------------

  describe('logout', () => {
    it('正常：将 jti 写入 Redis 黑名单（带 TTL）', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 1800 // 30 分钟后过期
      const user = {
        userId: 'user-1',
        openid: 'openid_x',
        jti: 'jti-logout',
        exp: futureExp,
      }

      await service.logout(user)

      expect(redis.set).toHaveBeenCalledWith(
        'auth:blacklist:jti-logout',
        '1',
        'EX',
        expect.any(Number),
      )
      // TTL 应大于 0 且小于等于 1800
      const ttl = (redis.set as jest.Mock).mock.calls[0][3]
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(1800)
    })

    it('已过期 Token：不写入黑名单', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 100
      const user = {
        userId: 'user-1',
        jti: 'jti-expired',
        exp: pastExp,
      }

      await service.logout(user)

      expect(redis.set).not.toHaveBeenCalled()
    })

    it('无 jti：幂等返回，不抛错', async () => {
      const user = { userId: 'user-1' }

      await expect(service.logout(user)).resolves.toBeUndefined()
      expect(redis.set).not.toHaveBeenCalled()
    })
  })

  // -------------------- 自定义异常辅助 --------------------

  it('BusinessException 应可被 instanceof 识别', () => {
    const err = new BusinessException(ErrorCode.FORBIDDEN, 'frozen', undefined)
    expect(err).toBeInstanceOf(BusinessException)
    expect(err.code).toBe(ErrorCode.FORBIDDEN)
  })
})
