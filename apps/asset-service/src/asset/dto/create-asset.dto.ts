/**
 * 资产相关 DTO
 *
 * - UploadTokenDto  : 获取 STS 上传凭证的请求体
 * - CreateAssetDto  : 用户直传 OSS 完成后登记资产记录的请求体
 *
 * 字段名对齐 Asset 实体（libs/database）：
 *   ossKey / name / type / size / mimeType / duration / thumbnailKey / avatarGroupId
 */
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { AssetType } from '@reelclone/database'

/**
 * 上传凭证请求 DTO
 * POST /api/v1/assets/upload-token
 */
export class UploadTokenDto {
  /** 文件类型，用于推导 OSS Key 前缀（assets/{fileType}/{userId}/...） */
  @ApiProperty({
    description: '文件类型，用于推导 OSS Key 前缀（image/video/audio）',
    example: 'image',
    enum: ['image', 'video', 'audio'],
  })
  @IsIn(['image', 'video', 'audio'])
  fileType: 'image' | 'video' | 'audio'

  /** 原始文件名（用于推断扩展名） */
  @ApiProperty({
    description: '原始文件名（用于推断扩展名）',
    example: 'avatar.png',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  fileName: string

  /** 可选 MIME 类型（透传给客户端，不参与 Key 生成） */
  @ApiProperty({
    description: 'MIME 类型（透传给客户端，不参与 Key 生成）',
    example: 'image/png',
    required: false,
  })
  @IsOptional()
  @IsString()
  contentType?: string
}

/**
 * 创建资产记录 DTO
 * POST /api/v1/assets
 *
 * 用户在小程序直传 OSS 成功后，携带返回的 ossKey 调用本接口登记资产。
 */
export class CreateAssetDto {
  /** 对象存储 Key（由 upload-token 接口返回） */
  @ApiProperty({
    description: '对象存储 Key（由 upload-token 接口返回）',
    example: 'assets/image/user-uuid/20260731-avatar.png',
    maxLength: 512,
  })
  @IsString()
  @MaxLength(512)
  ossKey: string

  /** 文件名 */
  @ApiProperty({
    description: '文件名',
    example: 'avatar.png',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  name: string

  /** 资产类型 */
  @ApiProperty({
    description: '资产类型（IMAGE/VIDEO/AUDIO）',
    example: AssetType.IMAGE,
    enum: AssetType,
  })
  @IsIn([AssetType.IMAGE, AssetType.VIDEO, AssetType.AUDIO])
  type: AssetType

  /** 文件大小（字节） */
  @ApiProperty({
    description: '文件大小（字节）',
    example: 102400,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  size: number

  /** MIME 类型 */
  @ApiProperty({
    description: 'MIME 类型',
    example: 'image/png',
    required: false,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string

  /** 音视频时长（秒） */
  @ApiProperty({
    description: '音视频时长（秒）',
    example: 15,
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number

  /** 缩略图 OSS Key */
  @ApiProperty({
    description: '缩略图 OSS Key',
    example: 'thumbnails/image/user-uuid/20260731-avatar.png',
    required: false,
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  thumbnailKey?: string

  /** 所属真人形象组 ID（可空） */
  @ApiProperty({
    description: '所属真人形象组 ID（可空）',
    example: 'a1b2c3d4-uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatarGroupId?: string
}
