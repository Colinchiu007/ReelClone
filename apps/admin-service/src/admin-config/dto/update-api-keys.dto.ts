/**
 * 更新 API Key DTO
 *
 * 用于管理员在后台更新各 Provider（seedance / llm / oss）的 API Key。
 * 调用 ConfigStoreService.set() 持久化到 DB + Redis 缓存 + 发布热刷新通知。
 *
 * 约定：
 *  - provider: 仅支持 'seedance' | 'llm' | 'oss'
 *  - keys: Key 数组（自动去除空字符串与首尾空白）
 */
import { IsArray, IsEnum, IsString } from 'class-validator'

/** 受支持的 Provider 名称 */
export type ApiKeyProvider = 'seedance' | 'llm' | 'oss'

/** Provider 枚举（用于 class-validator 校验） */
export enum ApiKeyProviderEnum {
  SEEDANCE = 'seedance',
  LLM = 'llm',
  OSS = 'oss',
}

export class UpdateApiKeysDto {
  /** 目标 Provider */
  @IsEnum(ApiKeyProviderEnum)
  provider: ApiKeyProvider

  /** Key 列表（覆盖式更新，空数组表示清空） */
  @IsArray()
  @IsString({ each: true })
  keys: string[]
}
