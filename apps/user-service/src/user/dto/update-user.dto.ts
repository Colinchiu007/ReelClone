/**
 * 更新用户信息 DTO
 * 用于 PUT /api/v1/users/me
 */
import { IsOptional, IsString, IsArray, MaxLength, IsEmail } from 'class-validator';

export class UpdateUserDto {
  /** 昵称 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  /** 头像 URL */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;

  /** 邮箱 */
  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string;

  /** 行业偏好标签列表 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industryPreferences?: string[];
}
