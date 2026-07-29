/**
 * UserController 单元测试
 *
 * 测试范围：
 * - 各端点的响应格式（控制器仅做转发，核心逻辑由 Service 负责）
 * - 验证 @CurrentUser 装饰器正确传递 userId
 * - 验证 SmsService 在 Mock 模式下返回 mockCode
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { SmsService } from './sms.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BindMobileDto } from './dto/bind-mobile.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SmsCodePurpose, UserStatus } from '@reelclone/database';

describe('UserController', () => {
  let controller: UserController;
  let userService: { getCurrentUser: jest.Mock; updateUser: jest.Mock; bindMobile: jest.Mock; changePassword: jest.Mock };
  let smsService: { sendCode: jest.Mock; isMockMode: jest.Mock };

  beforeEach(async () => {
    userService = {
      getCurrentUser: jest.fn(),
      updateUser: jest.fn(),
      bindMobile: jest.fn(),
      changePassword: jest.fn(),
    };

    smsService = {
      sendCode: jest.fn(),
      isMockMode: jest.fn(() => true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: SmsService, useValue: smsService },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- GET /users/me --------------------

  describe('getCurrentUser', () => {
    it('应调用 UserService.getCurrentUser 并返回用户数据', async () => {
      const mockUser = {
        id: 'user-1',
        nickname: 'TestUser',
        status: UserStatus.ACTIVE,
      };
      userService.getCurrentUser.mockResolvedValue(mockUser);

      const result = await controller.getCurrentUser('user-1');

      expect(userService.getCurrentUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUser);
    });
  });

  // -------------------- PUT /users/me --------------------

  describe('updateUser', () => {
    it('应调用 UserService.updateUser 并传入 userId 和 dto', async () => {
      const dto: UpdateUserDto = { nickname: 'NewName' };
      const mockUser = { id: 'user-1', nickname: 'NewName' };
      userService.updateUser.mockResolvedValue(mockUser);

      const result = await controller.updateUser('user-1', dto);

      expect(userService.updateUser).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockUser);
    });
  });

  // -------------------- POST /users/bind-mobile --------------------

  describe('bindMobile', () => {
    it('应调用 UserService.bindMobile 并传入 userId 和 dto', async () => {
      const dto: BindMobileDto = { mobile: '13800138000', code: '123456' };
      const mockUser = { id: 'user-1', mobile: '13800138000' };
      userService.bindMobile.mockResolvedValue(mockUser);

      const result = await controller.bindMobile('user-1', dto);

      expect(userService.bindMobile).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockUser);
    });
  });

  // -------------------- PUT /users/password --------------------

  describe('changePassword', () => {
    it('应调用 UserService.changePassword 并返回成功', async () => {
      const dto: ChangePasswordDto = {
        oldPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };
      userService.changePassword.mockResolvedValue({ success: true });

      const result = await controller.changePassword('user-1', dto);

      expect(userService.changePassword).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ success: true });
    });
  });

  // -------------------- POST /sms/send --------------------

  describe('sendSmsCode', () => {
    it('Mock 模式下应返回包含 mockCode 的响应', async () => {
      const dto: SendSmsDto = {
        mobile: '13800138000',
        purpose: SmsCodePurpose.BIND_MOBILE,
      };
      smsService.sendCode.mockResolvedValue('123456');
      smsService.isMockMode.mockReturnValue(true);

      const result = await controller.sendSmsCode(dto);

      expect(smsService.sendCode).toHaveBeenCalledWith(
        '13800138000',
        SmsCodePurpose.BIND_MOBILE,
      );
      expect(result).toEqual({
        mobile: '13800138000',
        purpose: SmsCodePurpose.BIND_MOBILE,
        expireSeconds: 300,
        mockCode: '123456',
      });
    });

    it('非 Mock 模式下不应返回 mockCode', async () => {
      const dto: SendSmsDto = {
        mobile: '13800138000',
        purpose: SmsCodePurpose.RESET_PASSWORD,
      };
      smsService.sendCode.mockResolvedValue('654321');
      smsService.isMockMode.mockReturnValue(false);

      const result = await controller.sendSmsCode(dto);

      expect(smsService.sendCode).toHaveBeenCalledWith(
        '13800138000',
        SmsCodePurpose.RESET_PASSWORD,
      );
      expect(result).toEqual({
        mobile: '13800138000',
        purpose: SmsCodePurpose.RESET_PASSWORD,
        expireSeconds: 300,
      });
      expect(result).not.toHaveProperty('mockCode');
    });
  });
});
