# Benchmark V2 CreditReservation 灰度发布方案

> 日期：2026-08-03
>
> 关联提交：`94ae726` (feat(benchmark): migrate billing to V2 CreditReservation (B4))
>
> 目标：确保 benchmark 计费从 legacy LedgerService 迁移到 V2 CreditReservationService 后，生产路径无回归。

## 1. 迁移概述

### 1.1 变更内容

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| 冻结路径 | `reservationMode=undefined` → `LedgerService.freeze()` | `reservationMode=true` → `CreditReservationService.freeze()` |
| 成功结算 | **缺失**（积分永久冻结） | workflow 成功后调用 `settleCredits()` |
| 失败释放 | `compensateRelease()` → `LedgerService.release()` | workflow catch 块调用 `releaseCredits()` |
| 取消释放 | `compensateRelease()` → `LedgerService.release()` | `compensateRelease()` → `CreditReservationService.release()` |
| 幂等键 | freeze/release 共用 create 的幂等键 | freeze/settle/release 三者独立幂等键 |

### 1.2 影响范围

- `apps/benchmark-service`：BillingClient、BenchmarkService、TemporalAdapter
- `libs/temporal`：BenchmarkParams、benchmarkAnalysisWorkflow
- 不影响生成链路（已有独立 V2 路径）

## 2. Feature Flag 策略

### 2.1 环境变量控制

```bash
# benchmark-service/.env
BENCHMARK_BILLING_MODE=v2          # v2 | legacy | off
```

**路由逻辑**（`billing-client.ts`）：

```typescript
async freeze(params: FreezeParams): Promise<FreezeResponse> {
  const useV2 = this.billingMode === 'v2'
  return this.client.post('/api/v1/points/freeze', {
    ...params,
    ...(useV2 ? { reservationMode: true, workId: params.benchmarkId } : {}),
  })
}
```

### 2.2 灰度阶段

| 阶段 | 流量比例 | 持续时间 | 前置条件 |
|------|----------|----------|----------|
| Stage 0: 验证 | 0%（仅 Mock） | 1 天 | 所有测试通过 |
| Stage 1: 内部 | 100%（内部用户） | 2 天 | Stage 0 无异常 |
| Stage 2: 小流量 | 10% 真实用户 | 3 天 | Stage 2 余额对账一致 |
| Stage 3: 全量 | 100% | 持续 | Stage 3 无 P0 事故 |

### 2.3 回滚方案

**即时回滚**（< 1 分钟）：

```bash
# 修改环境变量
BENCHMARK_BILLING_MODE=legacy

# 重启 benchmark-service
kubectl rollout restart deployment/benchmark-service
```

**数据回滚**：不需要。V2 和 legacy 路径的 `freezeId` 格式不同（`reservation-{id}` vs `{operationId}`），不会冲突。

## 3. 监控指标

### 3.1 核心指标（必须监控）

| 指标 | 来源 | 阈值 | 告警 |
|------|------|------|------|
| `benchmark_freeze_success_rate` | billing-service 日志 | < 99% | P1 |
| `benchmark_settle_success_rate` | billing-service 日志 | < 99% | P0 |
| `benchmark_release_success_rate` | billing-service 日志 | < 99% | P1 |
| `credit_reservation_open_count` | credit_reservation 表 | 持续增长 > 1h | P1 |
| `billing_outbox_backlog` | billing_projection_outbox 表 | > 100 | P1 |
| `billing_outbox_dead_count` | billing_projection_outbox 表 | > 0 | P0 |

### 3.2 业务指标

| 指标 | 计算方式 | 异常信号 |
|------|----------|----------|
| 冻结-结算差额 | `SUM(freeze) - SUM(settle) - SUM(release)` | 差额 > 0 且持续增长 |
| 冻结-释放延迟 | `terminalAt - createdAt` | 平均 > 10 分钟 |
| settlement 延迟 | `outbox.deliveredAt - outbox.createdAt` | 平均 > 1 分钟 |

### 3.3 对账查询

```sql
-- 检查未结算的冻结（应随时间减少）
SELECT user_id, COUNT(*), SUM(amount)
FROM credit_reservation
WHERE status = 'OPEN'
  AND created_at < NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING SUM(amount) > 0;

-- 检查 DEAD outbox
SELECT reservation_id, type, attempts, last_error
FROM billing_projection_outbox
WHERE delivery_status = 'DEAD'
ORDER BY created_at DESC;
```

## 4. 回归测试矩阵

### 4.1 单元测试覆盖（已通过）

| 测试文件 | 用例数 | 覆盖场景 |
|----------|--------|----------|
| benchmark-analysis.workflow.spec.ts | 5 | settle/release/兼容旧数据 |
| benchmark.service.spec.ts | 29 | freeze+settle Mock/非 Mock/cancel release |
| billing.service.spec.ts | 12 | reservationMode=true settle/release 路由 |
| credit-reservation.service.spec.ts | 18 | settle transition/幂等/金额不匹配 |
| billing.activities.spec.ts | 15 | Temporal activity 层参数透传 |
| **总计** | **79** | |

### 4.2 手动验证清单

| 场景 | 操作 | 预期结果 |
|------|------|----------|
| Mock 模式创建 | `TEMPORAL_MOCK_MODE=true` 创建 benchmark | 余额减少 300 → 立即返还（settle） |
| 非 Mock 模式创建 | 正常流程创建 benchmark | 余额减少 300 → workflow 完成后返还 |
| 取消任务 | 创建后立即取消 | 余额不变（freeze + release 抵消） |
| 余额不足 | 积分 < 300 时创建 | 抛出 BusinessException，无 reservation 记录 |
| 重复创建 | 相同 idempotencyKey 两次请求 | 第二次返回已有 benchmark，不重复冻结 |

## 5. 上线检查清单

### 5.1 上线前

- [ ] 所有单元测试通过（`npx jest` 全量）
- [ ] Mock 模式本地验证 settle 调用
- [ ] 灰度环境验证真实 Temporal workflow settle/release
- [ ] 监控告警配置完成
- [ ] 对账查询已保存到运维手册

### 5.2 上线后

- [ ] Stage 1 验证：内部用户 benchmark 正常
- [ ] Stage 2 验证：10% 流量余额对账一致
- [ ] Stage 3 全量后 24h 内无异常
- [ ] 更新重构报告标记 benchmark 计费迁移完成

### 5.3 回滚触发条件

| 条件 | 级别 | 动作 |
|------|------|------|
| settle 成功率 < 95% | P0 | 立即回滚到 legacy |
| 冻结-结算差额持续增长 > 30 分钟 | P0 | 立即回滚 + 人工对账 |
| DEAD outbox > 10 | P1 | 排查后决定是否回滚 |
| 单个用户余额不一致 | P0 | 立即回滚 + 人工修复 |

## 6. 验收标准

- [ ] Mock 模式：freeze → settle 全链路通过
- [ ] 非 Mock 模式：freeze → workflow → settle/release 全链路通过
- [ ] 取消路径：freeze → cancel → release 全链路通过
- [ ] 余额一致性：冻结金额 = 结算金额 + 释放金额
- [ ] 幂等性：重复 settle/release 不改变余额
- [ ] 兼容性：无 billingReservation 的旧数据正常处理

## 7. 后续优化

1. **监控仪表盘**：Grafana 面板展示 reservation 状态分布、outbox 堆积、settle 延迟
2. **自动对账**：每日 cron 检查冻结-结算差额，超过阈值自动告警
3. **清理 legacy 路径**：全量稳定 30 天后，删除 `reservationMode=false` 的 benchmark 路径
