# 最终审查

## 结论

未发现阻断合并的正确性、安全性或类型问题。本次改动可进入受控发布，真实外部依赖验收仍需在部署环境完成。

## 已验证

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `git diff --check`：通过。
- `npm run test:unit -- apps/billing-service/src/billing/credit-reservation.service.spec.ts apps/billing-service/src/billing/billing.service.spec.ts apps/billing-service/src/billing/ledger.service.spec.ts --runInBand`：51 个测试通过。
- `npm run test:unit -- libs/temporal/src/activities/seedance.activities.spec.ts libs/temporal/src/workflows/video-generation.workflow.spec.ts --runInBand`：24 个测试通过。
- `npm run test:unit -- apps/workbench-service/src/workbench/generation.service.spec.ts --runInBand`：24 个测试通过。

## 审查要点

- V2 预留状态、主库用户余额和 outbox 在同一 main 库事务中变更；billing 库只接受幂等投影。
- FREEZE 必须先投影，SETTLE/RELEASE 才能投影；outbox 使用主库行锁和 `SKIP LOCKED` 防止重复投递。
- 旧流水与 V2 reservation 明确隔离，缺少可验证关联时 fail-closed，不自动退款。
- 真实模式取消使用确定性 Temporal workflow ID；Provider 未确认前保留预留。
- 重试通过 Redis 所有权锁与 Work 行锁共同串行化，旧工作流不能覆盖新活动任务。

## 残余风险与上线前验收

- `provider_state_unknown` 和 `provider_cancel_pending` 需要依赖 Provider 的幂等提交或按客户端键查询契约，当前不能自动恢复。
- 历史 FREEZE 缺少 V2 reservation 关联，需上线前人工对账后处理。
- `GRANT`、`REWARD`、`CONSUME` 仍为旧跨库路径，不属于本次生成链路迁移范围。
- 未在真实 PostgreSQL、Redis、Temporal、OSS 和 Seedance 环境运行端到端验收。

## 外部双模型审查

- antigravity：环境中 `agy` 命令不可用。
- Claude wrapper：环境调用退出码 1，未能导出私有仓库上下文。
- 以本地独立审计、定向回归和静态门禁替代；上述外部依赖风险已显式保留。
