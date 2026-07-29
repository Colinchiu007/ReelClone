/**
 * 刷新 Token DTO
 */
import { IsNotEmpty, IsString } from 'class-validator'

export class RefreshTokenDto {
  /** Refresh Token（长效，用于换发新的 Access Token） */
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken: string
}
