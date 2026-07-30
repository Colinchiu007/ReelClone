/**
 * 广播公告 DTO
 *
 * body: { title, content, range }
 *  - range='all'    推送给所有用户
 *  - range='active'  推送给最近 7 天活跃用户（lastLoginAt 命中）
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** 广播范围 */
export type BroadcastRange = 'all' | 'active'

export class BroadcastDto {
  /** 公告标题 */
  @ApiProperty({
    description: '公告标题（最多 128 字符）',
    example: '系统维护通知',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string

  /** 公告内容 */
  @ApiProperty({
    description: '公告内容（最多 4000 字符）',
    example: '系统将于今晚 22:00-23:00 进行维护升级，请提前保存工作。',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string

  /** 广播范围，默认 all */
  @ApiProperty({
    description: '广播范围（all 推送给所有用户 / active 推送给最近 7 天活跃用户），默认 all',
    example: 'all',
    required: false,
    enum: ['all', 'active'],
  })
  @IsOptional()
  @IsEnum(['all', 'active'])
  range?: BroadcastRange = 'all'
}
