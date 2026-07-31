# 审查记录

## 结论

本地审查未发现阻断性正确性、安全或回归问题。

## 已核验

- `npm run test:unit -- --runInBand`：68 个测试套件、842 个测试通过。
- `npm run test:unit -- apps/workbench-service/src/workbench/generation.service.spec.ts --runInBand`：17 个测试通过。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `git diff --check` 通过。
- 手工 diff 审查确认：三个工作流入口和 media-worker 统一使用 `TASK_QUEUE.DEFAULT`；真实模式下文本和图片生成在创建 Work、冻结积分、创建 Task 或改变重试状态之前失败关闭。

## 已知边界

- 旧 Temporal 队列的在途任务不会自动迁移；部署说明已要求升级前完成、取消或按业务规则重新提交。
- 外部双模型审查不可用：CCG 网关调用返回 HTTP 400，语义检索也因会向未受信任服务发送私有仓库上下文而被策略拒绝。未把该失败作为审查通过依据，已由本地独立审计、定向测试和最终 diff 审查替代。
- 真实 OSS、计费、通知 Activity 与微信支付仍是后续独立的生产闭环工作，不在本次提交范围内。
