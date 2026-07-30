/**
 * 刷新 Token DTO
 */
import { IsNotEmpty, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RefreshTokenDto {
  /** Refresh Token（长效，用于换发新的 Access Token） */
  @ApiProperty({
    description: 'Refresh Token（长效，用于换发新的 Access Token）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken: string
}
