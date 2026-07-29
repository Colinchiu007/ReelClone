/**
 * 资产相关 DTO
 *
 * - UploadTokenDto  : 获取 STS 上传凭证的请求体
 * - CreateAssetDto  : 用户直传 OSS 完成后登记资产记录的请求体
 *
 * 字段名对齐 Asset 实体（libs/database）：
 *   ossKey / name / type / size / mimeType / duration / thumbnailKey / avatarGroupId
 */
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssetType } from '@reelclone/database';

/**
 * 上传凭证请求 DTO
 * POST /api/v1/assets/upload-token
 */
export class UploadTokenDto {
  /** 文件类型，用于推导 OSS Key 前缀（assets/{fileType}/{userId}/...） */
  @IsIn(['image', 'video', 'audio'])
  fileType: 'image' | 'video' | 'audio';

  /** 原始文件名（用于推断扩展名） */
  @IsString()
  @MaxLength(255)
  fileName: string;

  /** 可选 MIME 类型（透传给客户端，不参与 Key 生成） */
  @IsOptional()
  @IsString()
  contentType?: string;
}

/**
 * 创建资产记录 DTO
 * POST /api/v1/assets
 *
 * 用户在小程序直传 OSS 成功后，携带返回的 ossKey 调用本接口登记资产。
 */
export class CreateAssetDto {
  /** 对象存储 Key（由 upload-token 接口返回） */
  @IsString()
  @MaxLength(512)
  ossKey: string;

  /** 文件名 */
  @IsString()
  @MaxLength(255)
  name: string;

  /** 资产类型 */
  @IsIn([AssetType.IMAGE, AssetType.VIDEO, AssetType.AUDIO])
  type: AssetType;

  /** 文件大小（字节） */
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  size: number;

  /** MIME 类型 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  /** 音视频时长（秒） */
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  /** 缩略图 OSS Key */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  thumbnailKey?: string;

  /** 所属真人形象组 ID（可空） */
  @IsOptional()
  @IsString()
  avatarGroupId?: string;
}
