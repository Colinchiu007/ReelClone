/**
 * 广播公告 DTO
 *
 * body: { title, content, range }
 *  - range='all'    推送给所有用户
 *  - range='active'  推送给最近 7 天活跃用户（lastLoginAt 命中）
 */
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** 广播范围 */
export type BroadcastRange = 'all' | 'active'

export class BroadcastDto {
  /** 公告标题 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string

  /** 公告内容 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string

  /** 广播范围，默认 all */
  @IsOptional()
  @IsEnum(['all', 'active'])
  range?: BroadcastRange = 'all'
}
