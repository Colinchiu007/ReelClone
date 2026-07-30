import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

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
  @ApiProperty({
    description: '生成类型（文生视频/图生视频/3D 建模/编辑视频等）',
    example: GenerationType.TEXT_TO_VIDEO,
    enum: GenerationType,
  })
  @IsEnum(GenerationType)
  generationType!: GenerationType

  /** 提示词 */
  @ApiProperty({
    description: '提示词（最多 2000 字符）',
    example: '一只柴犬在草地上奔跑，电影感镜头',
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  prompt!: string

  /** 模型 ID（默认 seedance2-pro） */
  @ApiProperty({
    description: '模型 ID（默认 seedance2-pro）',
    example: 'seedance2-pro',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string

  /** 分辨率（视频类） */
  @ApiProperty({
    description: '分辨率（视频类：480p/720p/1080p）',
    example: Resolution.P720,
    enum: Resolution,
    required: false,
  })
  @IsOptional()
  @IsEnum(Resolution)
  resolution?: Resolution

  /** 宽高比 */
  @ApiProperty({
    description: '宽高比（9:16 竖屏 / 16:9 横屏 / 1:1 正方形）',
    example: AspectRatio.VERTICAL,
    enum: AspectRatio,
    required: false,
  })
  @IsOptional()
  @IsEnum(AspectRatio)
  aspectRatio?: AspectRatio

  /** 时长（秒，视频类） */
  @ApiProperty({
    description: '时长（秒，视频类，可选 5 或 10）',
    example: 5,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: 5 | 10

  /** 参考图 asset key 数组 */
  @ApiProperty({
    description: '参考图 asset key 数组',
    example: ['assets/image/user-uuid/20260731-ref1.png'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  referenceImages?: string[]

  /** 参考视频 asset key */
  @ApiProperty({
    description: '参考视频 asset key',
    example: 'assets/video/user-uuid/20260731-ref.mp4',
    required: false,
  })
  @IsOptional()
  @IsString()
  referenceVideo?: string

  /** 参考音频 asset key */
  @ApiProperty({
    description: '参考音频 asset key',
    example: 'assets/audio/user-uuid/20260731-bg.mp3',
    required: false,
  })
  @IsOptional()
  @IsString()
  referenceAudio?: string

  /** 首帧图 asset key */
  @ApiProperty({
    description: '首帧图 asset key',
    example: 'assets/image/user-uuid/20260731-first.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  firstFrame?: string

  /** 尾帧图 asset key */
  @ApiProperty({
    description: '尾帧图 asset key',
    example: 'assets/image/user-uuid/20260731-last.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  lastFrame?: string

  /** 幂等键（重复请求返回已有 work） */
  @ApiProperty({
    description: '幂等键（重复请求返回已有 work，最多 128 字符）',
    example: 'a3f5b8c9-1d2e-3f4a-5b6c-7d8e9f0a1b2c',
    required: false,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string

  /** 来源模板 ID（基于模板创作时传入，用于模板使用次数 +1） */
  @ApiProperty({
    description: '来源模板 ID（基于模板创作时传入，用于模板使用次数 +1）',
    example: 'a1b2c3d4-uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  templateId?: string

  /** 对标解析 ID（可选，从对标解析一键复刻时传入，用于溯源） */
  @ApiProperty({
    description: '对标解析 ID（从对标解析一键复刻时传入，用于溯源）',
    example: 'b2c3d4e5-uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  benchmarkId?: string
}
