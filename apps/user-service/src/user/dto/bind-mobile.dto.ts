/**
 * 绑定手机号 DTO
 * 用于 POST /api/v1/users/bind-mobile
 */
import { IsString, Matches, Length } from 'class-validator';

export class BindMobileDto {
  /** 手机号（中国大陆 11 位） */
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  mobile: string;

  /** 短信验证码（6 位数字） */
  @IsString()
  @Length(6, 8)
  code: string;
}
