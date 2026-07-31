# 实施计划

## 设计约束

- 不从 media-worker 或 Temporal 反向导入 workbench app 内的 `BillingClient`；计费沿用已有内部 HTTP API。
- Worker 写入主库和 Redis 通过启动时注入的结构化依赖完成；Temporal 包只依赖接口，不绑定 Nest DI。
- 所有账务操作使用同一笔预留中的稳定操作键：`freeze`、`settle`、`release` 各自唯一，释放在 API 取消和工作流取消之间共用一个键。
- 旧工作流只能更新自己的 GenerationTask；若其 taskId 已不再是 Work 的活动任务，不得覆盖 Work 状态。

## 步骤

1. 扩展 `VideoGenParams`，加入 `generationTaskId` 与 `billingReservation`（冻结流水、金额、结算键、释放键）；修正共享 Temporal 启动辅助函数的完整参数类型。
2. 修改 workbench 创建、取消、重试和启动流程：持久化活动任务与 reservation；重试重新冻结；所有补偿路径使用 reservation 的释放键。
3. 实现真实计费和 OSS Activity：计费通过 billing-service 内部 API 解包业务响应，OSS 复用已注入的 `OSSService`；补齐环境变量说明与单元测试。
4. 在 media-worker 装配 Work/Task 状态与 Redis 通知适配，显式映射状态和字段；`notification:task-completed` / `notification:task-failed` 必须与 notification-service 订阅契约一致。
5. 修复视频后处理后的缩略图输入为 OSS key 时的本地下载处理，并将工作流取消补偿放入 `CancellationScope.nonCancellable`。
6. 补齐 GenerationService、Activity、状态适配和工作流行为测试；运行定向测试、全量单测、类型检查、lint、diff 审查。

## 外部审查说明

外部双模型审查需要导出私有仓库上下文，当前环境策略拒绝该操作，CCG 网关也返回 HTTP 400。实现期间以独立本地审计、定向测试和最终 diff 审查替代；真实云环境验收仍需独立执行。

## Critical 修复计划（最终审查后追加）

1. 将生成预留的权威状态迁入 main 库：`credit_reservations` 与 User 余额在同一事务中创建/终态化，保证 OPEN -> SETTLED / RELEASED 互斥；`freezeId` 改为 reservation ID。
2. 在同一事务写入 `billing_projection_outbox`，异步投影到 billing 库。Projector 以稳定 transaction ID / 幂等键重放，billing 已写但 outbox 未标记送达时也可安全收敛。
3. 新代码只接受存在 main reservation 的 V2 `freezeId`；旧版 Work / 历史 FREEZE 缺少可验证关联，进入 fail-closed 对账路径，绝不自动结算或释放。
4. 对 Provider 提交回执丢失、轮询连续失败和取消未确认统一保留预留，并持久化 `provider_state_unknown` / `provider_cancel_pending`，不再进入通用退款路径。
5. 重试用短期 Redis 互斥锁和 Work 行锁/条件更新串行化；状态回写使用 `workId + activeGenerationTaskId` 条件更新，阻止旧工作流覆盖新任务。
6. 为上述失败时序添加单元测试，并在最终审查中明确：旧历史数据迁移与真实外部依赖验收仍需部署前对账。
