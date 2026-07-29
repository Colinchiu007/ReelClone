/**
 * UserService 单元测试
 *
 * 测试范围：
 * - getCurrentUser：含 password 字段过滤
 * - updateUser：更新字段
 * - bindMobile：成功 / 验证码错误 / 已绑定
 * - changePassword：旧密码模式 / 验证码模式
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { UserService } from './user.service';
import { SmsService } from './sms.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BindMobileDto } from './dto/bind-mobile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  User,
  UserStatus,
  SmsCodePurpose,
  REDIS_CLIENT,
} from '@reelclone/database';
import { BusinessException, ErrorCode } from '@reelclone/common';

// -------------------- Mock 工厂 --------------------

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    openId: 'openid-1',
    unionId: null,
    mobile: null,
    password: null,
    nickname: 'TestUser',
    avatarUrl: null,
    email: null,
    currentPoints: 0,
    totalPoints: 0,
    industryPreferences: [],
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    assets: [],
    works: [],
    avatarGroups: [],
    orders: [],
    userPackages: [],
    notifications: [],
    benchmarks: [],
    pointTransactions: [],
    favorites: [],
    ...overrides,
  } as User;
}

function createRedisMock(): jest.Mocked<Redis> {
  return {
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
    del: jest.fn(async () => 1),
    exists: jest.fn(async () => 0),
  } as unknown as jest.Mocked<Redis>;
}

// -------------------- 测试 --------------------

describe('UserService', () => {
  let service: UserService;
  let userRepo: jest.Mocked<Repository<User>>;
  let redis: jest.Mocked<Redis>;
  let smsService: { sendCode: jest.Mock; verifyCode: jest.Mock; isMockMode: jest.Mock };

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    redis = createRedisMock();

    smsService = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
      isMockMode: jest.fn(() => true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User, 'main'), useValue: userRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: SmsService, useValue: smsService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- getCurrentUser --------------------

  describe('getCurrentUser', () => {
    it('应返回用户完整信息（不含 password）', async () => {
      const user = createUser({ password: 'hashed_password' });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);

      const result = await service.getCurrentUser('user-1');

      expect(result.id).toBe('user-1');
      expect(result.nickname).toBe('TestUser');
      expect(result).not.toHaveProperty('password');
      expect((result as Record<string, unknown>).password).toBeUndefined();
    });

    it('用户不存在时应抛出 NOT_FOUND 异常', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(
        BusinessException,
      );
    });
  });

  // -------------------- updateUser --------------------

  describe('updateUser', () => {
    it('应更新指定字段并返回（不含 password）', async () => {
      const user = createUser();
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);
      (userRepo.save as jest.Mock).mockImplementation(async (u: User) => u);

      const dto: UpdateUserDto = {
        nickname: 'NewName',
        email: 'test@example.com',
        industryPreferences: ['tech', 'food'],
      };

      const result = await service.updateUser('user-1', dto);

      expect(result.nickname).toBe('NewName');
      expect(result.email).toBe('test@example.com');
      expect(result.industryPreferences).toEqual(['tech', 'food']);
      expect(result).not.toHaveProperty('password');
    });

    it('未提供的字段不应被更新', async () => {
      const user = createUser({ nickname: 'Original', email: 'old@test.com' });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);
      (userRepo.save as jest.Mock).mockImplementation(async (u: User) => u);

      const dto: UpdateUserDto = { nickname: 'NewName' };
      const result = await service.updateUser('user-1', dto);

      expect(result.nickname).toBe('NewName');
      expect(result.email).toBe('old@test.com');
    });
  });

  // -------------------- bindMobile --------------------

  describe('bindMobile', () => {
    const dto: BindMobileDto = { mobile: '13800138000', code: '123456' };

    it('验证码正确时应成功绑定手机号', async () => {
      const user = createUser({ mobile: null });
      (userRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(user) // 第一次：查找用户
        .mockResolvedValueOnce(null); // 第二次：检查手机号是否已被占用
      (userRepo.save as jest.Mock).mockImplementation(async (u: User) => u);
      smsService.verifyCode.mockResolvedValue(undefined);

      const result = await service.bindMobile('user-1', dto);

      expect(smsService.verifyCode).toHaveBeenCalledWith(
        '13800138000',
        SmsCodePurpose.BIND_MOBILE,
        '123456',
      );
      expect(result.mobile).toBe('13800138000');
    });

    it('用户已绑定手机号时应抛出异常', async () => {
      const user = createUser({ mobile: '13900139000' });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);

      try {
        await service.bindMobile('user-1', dto);
        fail('应抛出异常');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException);
        expect((err as BusinessException).message).toContain('已绑定');
      }
    });

    it('验证码错误时应抛出异常', async () => {
      const user = createUser({ mobile: null });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);
      smsService.verifyCode.mockRejectedValue(
        new BusinessException(ErrorCode.VALIDATION_ERROR, '验证码不正确'),
      );

      await expect(service.bindMobile('user-1', dto)).rejects.toThrow(
        BusinessException,
      );
    });

    it('手机号已被其他用户绑定时应抛出异常', async () => {
      const user = createUser({ mobile: null });
      (userRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(user) // 查找用户
        .mockResolvedValueOnce(createUser({ id: 'other-user' })); // 手机号已被占用
      smsService.verifyCode.mockResolvedValue(undefined);

      try {
        await service.bindMobile('user-1', dto);
        fail('应抛出异常');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessException);
        expect((err as BusinessException).message).toContain('已被其他账号');
      }
    });
  });

  // -------------------- changePassword --------------------

  describe('changePassword', () => {
    it('旧密码模式：用户已设置密码，验证旧密码后更新', async () => {
      const hashedOld = await bcrypt.hash('OldPassword123', 10);
      const user = createUser({ password: hashedOld });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);
      (userRepo.save as jest.Mock).mockImplementation(async (u: User) => u);

      const dto: ChangePasswordDto = {
        oldPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      const result = await service.changePassword('user-1', dto);

      expect(result.success).toBe(true);
      // 验证新密码已被哈希
      expect(user.password).not.toBe('NewPassword456');
      expect(await bcrypt.compare('NewPassword456', user.password!)).toBe(true);
      // 应写入 Redis 吊销标记
      expect(redis.set).toHaveBeenCalledWith(
        'user:password-changed:user-1',
        expect.any(Number),
        'EX',
        7 * 24 * 60 * 60,
      );
    });

    it('旧密码模式：旧密码不正确时应抛出异常', async () => {
      const hashedOld = await bcrypt.hash('OldPassword123', 10);
      const user = createUser({ password: hashedOld });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);

      const dto: ChangePasswordDto = {
        oldPassword: 'WrongPassword',
        newPassword: 'NewPassword456',
      };

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(
        BusinessException,
      );
    });

    it('旧密码模式：未提供 oldPassword 时应抛出异常', async () => {
      const hashedOld = await bcrypt.hash('OldPassword123', 10);
      const user = createUser({ password: hashedOld });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);

      const dto: ChangePasswordDto = {
        newPassword: 'NewPassword456',
      };

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(
        BusinessException,
      );
    });

    it('验证码模式：用户未设置密码，通过短信验证码设置密码', async () => {
      const user = createUser({ password: null });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);
      (userRepo.save as jest.Mock).mockImplementation(async (u: User) => u);
      smsService.verifyCode.mockResolvedValue(undefined);

      const dto: ChangePasswordDto = {
        mobile: '13800138000',
        code: '123456',
        newPassword: 'FirstPassword123',
      };

      const result = await service.changePassword('user-1', dto);

      expect(smsService.verifyCode).toHaveBeenCalledWith(
        '13800138000',
        SmsCodePurpose.RESET_PASSWORD,
        '123456',
      );
      expect(result.success).toBe(true);
    });

    it('验证码模式：未提供 mobile 和 code 时应抛出异常', async () => {
      const user = createUser({ password: null });
      (userRepo.findOne as jest.Mock).mockResolvedValue(user);

      const dto: ChangePasswordDto = {
        newPassword: 'FirstPassword123',
      };

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(
        BusinessException,
      );
    });
  });
});
