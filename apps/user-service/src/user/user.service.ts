/**
 * 用户服务
 *
 * 职责：
 * - 获取当前用户信息（过滤 password 字段）
 * - 更新用户信息
 * - 绑定手机号（校验验证码 → 更新 mobile）
 * - 修改密码（旧密码模式 / 短信验证码模式）
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import {
  User,
  UserStatus,
  SmsCodePurpose,
  DATABASE_CONNECTIONS,
  REDIS_CLIENT,
} from '@reelclone/database';
import {
  BusinessException,
  ErrorCode,
} from '@reelclone/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { BindMobileDto } from './dto/bind-mobile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SmsService } from './sms.service';

/** bcrypt 加密轮次 */
const BCRYPT_ROUNDS = 10;

/** 修改密码后吊销 Token 的 Redis Key 前缀 */
const PASSWORD_CHANGED_KEY_PREFIX = 'user:password-changed';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepository: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly smsService: SmsService,
  ) {}

  /**
   * 获取当前用户完整信息（不含 password）
   */
  async getCurrentUser(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.findUserById(userId);
    return this.sanitizeUser(user);
  }

  /**
   * 更新用户信息
   */
  async updateUser(userId: string, dto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const user = await this.findUserById(userId);

    // 按需更新字段
    if (dto.nickname !== undefined) {
      user.nickname = dto.nickname;
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl;
    }
    if (dto.email !== undefined) {
      user.email = dto.email;
    }
    if (dto.industryPreferences !== undefined) {
      user.industryPreferences = dto.industryPreferences;
    }

    const saved = await this.userRepository.save(user);
    this.logger.log(`User ${userId} updated profile`);
    return this.sanitizeUser(saved);
  }

  /**
   * 绑定手机号
   *
   * 流程：
   * 1. 校验验证码（SmsService.verifyCode）
   * 2. 检查手机号是否已被其他用户绑定
   * 3. 更新 user.mobile
   *
   * @throws BusinessException 验证码错误 / 手机号已被绑定 / 用户已绑定手机号
   */
  async bindMobile(userId: string, dto: BindMobileDto): Promise<Omit<User, 'password'>> {
    const user = await this.findUserById(userId);

    // 用户已绑定手机号
    if (user.mobile) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        '您已绑定手机号，如需更换请联系客服',
        { currentMobile: user.mobile },
      );
    }

    // 校验验证码
    await this.smsService.verifyCode(dto.mobile, SmsCodePurpose.BIND_MOBILE, dto.code);

    // 检查手机号是否已被其他用户绑定
    const existingUser = await this.userRepository.findOne({
      where: { mobile: dto.mobile },
      select: ['id'],
    });
    if (existingUser && existingUser.id !== userId) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        '该手机号已被其他账号绑定',
        { mobile: dto.mobile },
      );
    }

    // 更新手机号
    user.mobile = dto.mobile;
    const saved = await this.userRepository.save(user);
    this.logger.log(`User ${userId} bound mobile ${dto.mobile}`);
    return this.sanitizeUser(saved);
  }

  /**
   * 修改密码
   *
   * 逻辑：
   * - 如果用户已设置密码（user.password 不为 null），用 oldPassword 验证
   * - 否则用短信验证码验证（code + mobile）
   *
   * 修改成功后，将 userId 写入 Redis 触发其他服务校验现有 Token
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    const user = await this.findUserById(userId);

    if (user.password) {
      // ---- 旧密码模式 ----
      if (!dto.oldPassword) {
        throw new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          '请输入旧密码',
          { field: 'oldPassword' },
        );
      }

      const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.password);
      if (!isOldPasswordValid) {
        throw new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          '旧密码不正确',
          { field: 'oldPassword' },
        );
      }
    } else {
      // ---- 短信验证码模式 ----
      if (!dto.code || !dto.mobile) {
        throw new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          '首次设置密码需通过短信验证码验证，请提供 mobile 和 code',
          { required: ['mobile', 'code'] },
        );
      }

      // 校验验证码（用途为 RESET_PASSWORD）
      await this.smsService.verifyCode(
        dto.mobile,
        SmsCodePurpose.RESET_PASSWORD,
        dto.code,
      );
    }

    // 哈希新密码并保存
    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    user.password = hashedPassword;
    await this.userRepository.save(user);

    // 吊销所有现有 Token：将 userId 写入 Redis
    await this.revokeAllTokens(userId);

    this.logger.log(`User ${userId} changed password`);
    return { success: true };
  }

  /**
   * 吊销用户所有现有 Token
   * 在 Redis 中写入标记，其他服务可通过检查此标记使现有 Token 失效
   */
  private async revokeAllTokens(userId: string): Promise<void> {
    const key = `${PASSWORD_CHANGED_KEY_PREFIX}:${userId}`;
    const now = Date.now();
    // Token 最长有效期 7 天（与 refresh token 对齐），过期后自动清理
    await this.redis.set(key, now, 'EX', 7 * 24 * 60 * 60);
  }

  /**
   * 根据 ID 查找用户，不存在则抛出 404
   */
  private async findUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw BusinessException.notFound('用户');
    }

    if (user.status === UserStatus.FROZEN) {
      throw BusinessException.forbidden('账号已被冻结');
    }

    return user;
  }

  /**
   * 过滤敏感字段（password），返回安全用户对象
   */
  private sanitizeUser(user: User): Omit<User, 'password'> {
    const { password: _, ...rest } = user;
    return rest;
  }
}
