/**
 * env.ts —— 环境配置适配层（条件编译规范化）
 *
 * 一、环境常量
 *   API_BASE_URL / WS_BASE_URL 由 config/*.ts 的 defineConstants 在构建期注入。
 *   业务代码统一经本适配层读取，避免在源码中散落 process.env.NODE_ENV 判断。
 *   优先级：defineConstants 注入值（构建期）→ 本地开发默认值。
 *
 * 二、平台判断
 *   Taro 构建期将 process.env.TARO_ENV 替换为具体平台字符串（weapp/h5/rn...）。
 *   业务代码一律通过 IS_WEAPP / IS_H5 等布尔值判断，避免散落 TARO_ENV 字面量，
 *   为未来 H5 按需编译预留统一出口。
 */
declare const API_BASE_URL: string | undefined
declare const WS_BASE_URL: string | undefined

/** API 基础地址（云托管网关） */
export const API_BASE: string = API_BASE_URL ?? 'http://localhost:3000/api'

/** WebSocket 基础地址（任务进度推送） */
export const WS_BASE: string = WS_BASE_URL ?? 'ws://localhost:3008'

/** Taro 支持的编译平台 */
export type RuntimePlatform = 'weapp' | 'h5' | 'rn' | 'swan' | 'alipay' | 'tt' | 'qq' | 'jd'

/** 当前编译平台（构建期注入；测试环境未注入时为 undefined） */
export const RUNTIME_PLATFORM: RuntimePlatform | undefined = process.env.TARO_ENV as
  RuntimePlatform | undefined

/** 是否微信小程序 */
export const IS_WEAPP = RUNTIME_PLATFORM === 'weapp'

/** 是否 H5 Web */
export const IS_H5 = RUNTIME_PLATFORM === 'h5'

/** 是否 React Native */
export const IS_RN = RUNTIME_PLATFORM === 'rn'
