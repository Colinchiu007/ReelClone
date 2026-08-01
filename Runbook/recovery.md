# Runbook: 恢复流程

> **本文档为骨架占位，待 ADR-002（durable generation execution）落地后补充实际恢复步骤。**
> **本流程用于处理生成 saga 与计费链路中的不确定状态，对应告警规则见 Runbook/alerting.md。**

---

## 人工 Reconciliation Case 状态机

所有人工 reconciliation case 遵循以下状态机：

```
OPEN → INVESTIGATING → RESOLVING → RESOLVED
                                  ↘ ESCALATED
```

### 状态定义

#### OPEN

<!-- TODO: 补充 OPEN 状态定义与触发条件 -->

- **含义**：case 已创建（由告警或人工发现），尚未开始调查。
- **触发条件**：<!-- TODO: 例如 paid-without-grant 告警、provider duplicate submission 告警 -->
- **负责人**：<!-- TODO: 值班 oncall -->
- **SLA**：<!-- TODO: 进入 INVESTIGATING 的时限 -->

#### INVESTIGATING

<!-- TODO: 补充 INVESTIGATING 状态定义 -->

- **含义**：正在调查 root cause，收集证据。
- **调查步骤**：
  1. <!-- TODO: 查询相关生成任务状态 -->
  2. <!-- TODO: 查询 provider 侧实际结果 -->
  3. <!-- TODO: 查询 billing reservation / operation 状态 -->
  4. <!-- TODO: 确定不一致点 -->
- **退出条件**：root cause 已确定，进入 RESOLVING；或无法确定，进入 ESCALATED。

#### RESOLVING

<!-- TODO: 补充 RESOLVING 状态定义 -->

- **含义**：root cause 已确定，正在执行恢复动作。
- **恢复动作（按 case 类型）**：
  - **paid-without-grant**：<!-- TODO: 手动发放积分步骤 -->
  - **provider duplicate submission**：<!-- TODO: 退还重复扣费步骤 -->
  - **OPEN reservation 超时**：<!-- TODO: 释放或结算冻结步骤 -->
- **退出条件**：恢复动作执行完成且校验通过，进入 RESOLVED。

#### RESOLVED

<!-- TODO: 补充 RESOLVED 状态定义 -->

- **含义**：case 已解决，状态已收敛，数据一致性已校验。
- **关闭检查**：
  1. <!-- TODO: invariant scan 通过 -->
  2. <!-- TODO: 受影响用户已收到通知（如适用） -->
  3. <!-- TODO: case 记录归档 -->

#### ESCALATED

<!-- TODO: 补充 ESCALATED 状态定义 -->

- **含义**：调查无法确定 root cause，或恢复动作超出值班权限，已升级。
- **升级对象**：<!-- TODO: tech lead / 数据库管理员 -->
- **处理**：<!-- TODO: 升级后流程 -->

---

## 恢复操作规范

<!-- TODO: 补充恢复操作规范 -->

1. **禁止直接修改数据库**：所有恢复动作必须通过 service API 或专用 reconciliation 工具执行，禁止直接 SQL 修改余额或状态。
2. **保留审计痕迹**：所有恢复操作必须记录 audit log（操作人、时间、前后状态）。
3. **不可猜测**：参见 Runbook/manual-reconciliation.md——禁止按金额或描述猜测关联关系。
