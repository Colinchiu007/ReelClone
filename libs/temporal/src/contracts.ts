/**
 * @reelclone/temporal/contracts
 *
 * 纯契约层 — 枚举、接口、常量，零实现依赖。
 *
 * 消费方仅需类型时，优先从此入口导入：
 *   import { WorkStatus, VideoGenParams } from '@reelclone/temporal/contracts'
 *
 * 本文件不依赖 @temporalio/* 或任何 NestJS 模块，
 * 可被 workflow、activity、外部服务安全引用而不会引入编译副作用。
 */
export * from './types'
