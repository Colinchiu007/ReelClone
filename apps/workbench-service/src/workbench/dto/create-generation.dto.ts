import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 生成类型枚举
 * - TEXT_TO_VIDEO: 文生视频
 * - IMAGE_TO_VIDEO_FIRST: 图生视频（首帧）
 * - IMAGE_TO_VIDEO_FIRST_LAST: 图生视频（首尾帧）
 * - THREE_D_MODELING: 3D 建模
 * - EDIT_VIDEO: 编辑视频
 * - EXTEND_VIDEO: 延长视频
 * - TEXT_GENERATE: 文本生成
 * - IMAGE_GENERATE: 图片生成
 */
export enum GenerationType {
  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',
  IMAGE_TO_VIDEO_FIRST = 'IMAGE_TO_VIDEO_FIRST',
  IMAGE_TO_VIDEO_FIRST_LAST = 'IMAGE_TO_VIDEO_FIRST_LAST',
  THREE_D_MODELING = '3D_MODELING',
  EDIT_VIDEO = 'EDIT_VIDEO',
  EXTEND_VIDEO = 'EXTEND_VIDEO',
  TEXT_GENERATE = 'TEXT_GENERATE',
  IMAGE_GENERATE = 'IMAGE_GENERATE',
}

/** 视频分辨率 */
export enum Resolution {
  P480 = '480p',
  P720 = '720p',
  P1080 = '1080p',
}

/** 宽高比 */
export enum AspectRatio {
  VERTICAL = '9:16',
  HORIZONTAL = '16:9',
  SQUARE = '1:1',
}

/**
 * 提交生成任务 DTO
 *
 * 业务流程：
 *  1. 计算消耗积分
 *  2. 调用 billing-service 冻结积分
 *  3. 创建 Work + GenerationTask 记录
 *  4. 启动 Temporal 工作流
 */
export class CreateGenerationDto {
  /** 生成类型 */
  @IsEnum(GenerationType)
  generationType!: GenerationType;

  /** 提示词 */
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  /** 模型 ID（默认 seedance2-pro） */
  @IsOptional()
  @IsString()
  model?: string;

  /** 分辨率（视频类） */
  @IsOptional()
  @IsEnum(Resolution)
  resolution?: Resolution;

  /** 宽高比 */
  @IsOptional()
  @IsEnum(AspectRatio)
  aspectRatio?: AspectRatio;

  /** 时长（秒，视频类） */
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: 5 | 10;

  /** 参考图 asset key 数组 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  referenceImages?: string[];

  /** 参考视频 asset key */
  @IsOptional()
  @IsString()
  referenceVideo?: string;

  /** 参考音频 asset key */
  @IsOptional()
  @IsString()
  referenceAudio?: string;

  /** 首帧图 asset key */
  @IsOptional()
  @IsString()
  firstFrame?: string;

  /** 尾帧图 asset key */
  @IsOptional()
  @IsString()
  lastFrame?: string;

  /** 幂等键（重复请求返回已有 work） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
