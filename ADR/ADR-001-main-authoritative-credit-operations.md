# ADR-001: 余额与积分操作在 main 库权威，billing 库只做投影

- **状态**：Accepted
- **日期**：2026-08-01
- **关联文档**：CURRENT_ARCHITECTURE.md 第二节、`01-docs/03-技术架构方案.md`（TARGET）

---

## Context（背景）

当前 billing-service 同时承载两套路径：

1. **legacy ledger** — 跨库写入 `reelclone_billing` 库的流水。
2. **V2 reservation** — 在 `reelclone_main` 库中维护权威余额与 operation 记录（`credit-reservation.entity.ts`）。

历史架构中，legacy 计费采用跨库双写：余额变更同时落入 `reelclone_main` 与 `reelclone_billing`。这种跨库双写在没有 2PC 的情况下存在**不可恢复窗口**——一旦其中一库写入成功而另一库失败，将产生数据不一致，且无法通过简单重放确定权威状态。

13 号《项目深度重构分析报告》将此列为 P0 级风险。

## Decision（决策）

**余额与 operation 在 `reelclone_main` 库权威，`reelclone_billing` 库只做投影（projection）。**

具体含义：

- `reelclone_main` 是余额、冻结、结算、operation 的唯一权威来源（source of truth）。
- `reelclone_billing` 仅作为审计投影库，通过 outbox + projection 机制从 main 异步派生。
- billing 库的数据可以随时从 main 库重放重建，不具备独立权威性。
- 任何余额读路径以 main 库为准。

## Alternatives（备选方案）

1. **Formance Ledger**
   - 引入外部 Ledger 系统作为权威。
   - 否决理由：当前规模下属于过度设计；引入新的外部依赖与运维负担；与当前自建 V2 reservation 模型语义不匹配。Formance 属于 TARGET 架构，未达到引入触发条件。

2. **跨库 2PC（两阶段提交）**
   - 在 main 与 billing 之间强制分布式事务。
   - 否决理由：性能差，阻塞时间长；PostgreSQL 跨库 2PC 实现复杂且脆弱；与微服务松耦合目标相悖。

## Consequences（后果）

- **正向**：
  - `reelclone_billing` 库可任意重放（drop 后从 main 重建），不影响业务正确性。
  - 消除跨库双写的不可恢复窗口。
  - 余额读路径单一化，降低心智负担。
- **负向**：
  - 需要引入 invariant scan（不变量扫描）机制，定期校验 billing 投影与 main 权威的一致性。
  - billing 库存在投影延迟，审计读路径需接受最终一致。
  - 历史遗留的 legacy ledger 路径需要逐步下线。
