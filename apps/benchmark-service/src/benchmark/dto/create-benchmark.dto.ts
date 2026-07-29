import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 提交对标解析任务 DTO
 *
 * 请求体：{ sourceUrl: string, idempotencyKey?: string }
 * - sourceUrl: 对标视频链接（抖音/小红书/B站/快手/微博/视频号）
 * - idempotencyKey: 幂等键（可选，未提供时由服务端生成）
 */
export class CreateBenchmarkDto {
  /** 对标视频链接 */
  @IsString()
  @MaxLength(1024)
  sourceUrl!: string;

  /** 幂等键（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
