# ADR-002: 生成执行的可持久化与 reconciler 作为正式组件

- **状态**：Accepted
- **日期**：2026-08-01
- **关联文档**：CURRENT_ARCHITECTURE.md 第三节、`01-docs/13-项目深度重构分析报告.md`

---

## Context（背景）

当前生成 saga（workbench-service → Temporal workflow → media-worker activities → Seedance provider）缺乏 durable reconciler。

具体问题：

- 当 provider 调用后发生超时或异常，系统进入 `provider_state_unknown` 状态。
- 当前没有恢复闭环：无法证明生成任务最终是否成功、是否已扣费、是否需要补偿。
- 生成任务的状态散落在 Temporal workflow 内存与 Redis 缓存中，缺乏可恢复的持久化 intent。

13 号报告将「生成 saga 缺 durable reconciler」列为 P0 级风险。

## Decision（决策）

**所有外部副作用发生前，先落 execution/intent 持久化记录；reconciler 作为正式组件持续收敛状态。**

具体含义：

- 在调用任何外部 provider（Seedance 等）之前，必须先将 execution intent（含幂等键、预期副作用）写入持久存储。
- reconciler 是正式组件（非临时脚本），周期性扫描处于不确定状态（如 `provider_state_unknown`）的执行记录，通过 provider 查询接口收敛真实状态。
- 状态收敛后触发对应的结算 / 退款 / 重试动作。

## Alternatives（备选方案）

1. **Redis-only 状态存储**
   - 仅在 Redis 中维护生成任务状态。
   - 否决理由：Redis 不是持久化权威，宕机或驱逐后状态不可恢复；无法证明收敛。

2. **大爆炸重写（Big Bang Rewrite）**
   - 一次性重写整个生成 saga。
   - 否决理由：风险高，影响在跑业务；无法增量验证；与渐进式重构策略相悖。

## Consequences（后果）

- **正向**：
  - 可证明收敛——任何生成任务最终都能被 reconciler 收敛到确定状态（成功 / 失败 / 退款）。
  - 外部副作用前落盘 intent，使崩溃恢复成为可能。
  - 为 build-once 部署与可观测性提供基础。
- **负向**：
  - 状态机复杂度增加（需定义更多中间状态与转换规则）。
  - reconciler 需要持续运维与监控（见 Runbook/alerting.md）。
  - 需要为 provider 查询接口设计幂等合约。
