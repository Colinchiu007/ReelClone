/**
 * Worker 模块
 *
 * 组织 media-worker 的 Worker 相关组件。
 *
 * 当前 Activity 实现位于 libs/temporal（独立函数，由 Worker 直接注册），
 * 因此本模块暂不持有额外 Provider，主要承担：
 *   1. 作为 Worker 子模块的 NestJS 组织单元
 *   2. 后续切换为 DI 注入的 Activity 时，在此注册 Provider
 *
 * 启动编排由 main.ts 调用 worker.bootstrap.ts 完成。
 */
import { Module } from '@nestjs/common'

@Module({})
export class WorkerModule {}
