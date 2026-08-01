# Runbook: 告警规则

> **本文档为骨架占位，待 observability 与 alerting 基础设施落地后补充实际规则与阈值。**
> **告警规则对应 ADR-001（余额权威）与 ADR-002（durable execution）的不变量监控。**

---

## 告警规则清单

### 1. 生成 pending age（生成任务排队超时）

<!-- TODO: 补充规则定义 -->

- **含义**：生成任务进入 pending 状态后超过阈值仍未进入执行态。
- **阈值**：<!-- TODO: 待定义，例如 > 5 分钟 -->
- **查询源**：<!-- TODO: workbench-service generation_task 表 -->
- **严重级别**：<!-- TODO -->
- **处理**：<!-- TODO: 排查 Temporal worker 是否存活、media-worker 是否阻塞 -->

---

### 2. OPEN reservation age（冻结预留超时未结算）

<!-- TODO: 补充规则定义 -->

- **含义**：credit reservation 处于 OPEN 状态超过阈值，说明冻结后未结算也未释放。
- **关联**：ADR-001
- **阈值**：<!-- TODO: 待定义，例如 > 30 分钟 -->
- **查询源**：<!-- TODO: reelclone_main.credit_reservations -->
- **严重级别**：<!-- TODO -->
- **处理**：<!-- TODO: 触发 reconciler 检查对应生成任务状态 -->

---

### 3. outbox backlog（billing 投影 outbox 积压）

<!-- TODO: 补充规则定义 -->

- **含义**：billing-projection-outbox 表中未处理记录数超过阈值，说明投影消费滞后。
- **关联**：ADR-001（billing 库为投影）
- **阈值**：<!-- TODO: 待定义，例如 > 1000 条或滞后 > 10 分钟 -->
- **查询源**：<!-- TODO: reelclone_main.billing_projection_outbox -->
- **严重级别**：<!-- TODO -->
- **处理**：<!-- TODO: 检查 billing-projection.cron 是否正常运行 -->

---

### 4. paid-without-grant（支付成功但未发放积分）

<!-- TODO: 补充规则定义 -->

- **含义**：订单已支付但对应积分未发放（grant），存在用户投诉风险。
- **关联**：order-service → billing-service grant 链路
- **阈值**：<!-- TODO: 待定义，例如 支付后 > 5 分钟未 grant -->
- **查询源**：<!-- TODO: order-service orders 表 + billing point_transactions 联合查询 -->
- **严重级别**：<!-- TODO: P0 -->
- **处理**：<!-- TODO: 参见 Runbook/recovery.md 人工 reconciliation 流程 -->

---

### 5. provider duplicate submission（provider 重复提交）

<!-- TODO: 补充规则定义 -->

- **含义**：同一生成任务向 provider（Seedance）提交超过一次，可能产生重复扣费。
- **关联**：ADR-002（durable execution）
- **阈值**：<!-- TODO: 待定义，例如 同一 task_id 提交 > 1 次 -->
- **查询源**：<!-- TODO: media-worker activity 日志 / execution intent 表 -->
- **严重级别**：<!-- TODO: P0 -->
- **处理**：<!-- TODO: 检查幂等键是否生效，参见 Runbook/recovery.md -->

---

### 6. worker poller（Temporal worker 轮询异常）

<!-- TODO: 补充规则定义 -->

- **含义**：media-worker 的 Temporal poller 停止轮询或频繁断连。
- **阈值**：<!-- TODO: 待定义，例如 poller 无心跳 > 2 分钟 -->
- **查询源**：<!-- TODO: Temporal visibility / worker healthcheck -->
- **严重级别**：<!-- TODO -->
- **处理**：<!-- TODO: 检查 media-worker 容器状态、Temporal 连接 -->

---

### 7. readiness（就绪检查失败）

<!-- TODO: 补充规则定义 -->

- **含义**：任一微服务 healthcheck 连续失败。
- **阈值**：<!-- TODO: 待定义，例如连续 3 次 healthcheck 失败 -->
- **查询源**：<!-- TODO: docker healthcheck / Nginx upstream 状态 -->
- **严重级别**：<!-- TODO -->
- **处理**：<!-- TODO: 检查对应服务容器日志与资源占用 -->
