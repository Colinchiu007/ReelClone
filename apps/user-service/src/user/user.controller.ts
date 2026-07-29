/**
 * 用户控制器
 *
 * 端点：
 * - GET    /api/v1/users/me          获取当前用户（需 JWT）
 * - PUT    /api/v1/users/me          更新用户信息（需 JWT）
 * - POST   /api/v1/users/bind-mobile 绑定手机号（需 JWT）
 * - PUT    /api/v1/users/password    修改密码（需 JWT）
 * - POST   /api/v1/sms/send          发送短信验证码（需 JWT + 限流）
 *
 * 注意：全局前缀 `api/v1` 在 main.ts 中设置，此处仅声明子路径。
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import {
  CurrentUser,
  RateLimit,
} from '@reelclone/common';
import { UserService } from './user.service';
import { SmsService } from './sms.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BindMobileDto } from './dto/bind-mobile.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly smsService: SmsService,
  ) {}

  // -------------------- 用户信息 --------------------

  /**
   * GET /api/v1/users/me
   * 获取当前登录用户完整信息（不含 password）
   */
  @Get('users/me')
  async getCurrentUser(@CurrentUser('userId') userId: string) {
    return this.userService.getCurrentUser(userId);
  }

  /**
   * PUT /api/v1/users/me
   * 更新当前用户信息
   */
  @Put('users/me')
  async updateUser(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(userId, dto);
  }

  // -------------------- 绑定手机号 --------------------

  /**
   * POST /api/v1/users/bind-mobile
   * 绑定手机号：校验验证码 → 更新 user.mobile
   */
  @Post('users/bind-mobile')
  @HttpCode(HttpStatus.OK)
  async bindMobile(
    @CurrentUser('userId') userId: string,
    @Body() dto: BindMobileDto,
  ) {
    return this.userService.bindMobile(userId, dto);
  }

  // -------------------- 修改密码 --------------------

  /**
   * PUT /api/v1/users/password
   * 修改密码：已设置密码用旧密码验证，未设置密码用短信验证码验证
   */
  @Put('users/password')
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(userId, dto);
  }

  // -------------------- 短信验证码 --------------------

  /**
   * POST /api/v1/sms/send
   * 发送短信验证码（限流：同一标识 60 秒内 10 次）
   *
   * 限流说明：
   * - @RateLimit(10, 60) 为令牌桶整体限制
   * - 同一 mobile 60s 内只能发一次由 SmsService 内部 Redis lockout 保证
   */
  @Post('sms/send')
  @HttpCode(HttpStatus.OK)
  @RateLimit(10, 60)
  async sendSmsCode(@Body() dto: SendSmsDto) {
    const code = await this.smsService.sendCode(dto.mobile, dto.purpose);
    return {
      mobile: dto.mobile,
      purpose: dto.purpose,
      expireSeconds: 300,
      // Mock 模式下返回验证码方便测试，真实模式不返回
      ...(this.smsService.isMockMode() ? { mockCode: code } : {}),
    };
  }
}
