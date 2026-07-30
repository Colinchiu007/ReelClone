# Checklist: 用户上传视频转模板功能

> 质量节拍 Phase 1→2 测试 + 验收清单

---

## 阶段 1：数据库 + 实体

- [ ] template.entity.ts 新增 5 个字段（sourceAssetId/videoMeta/analysisReport/workflowId/failureReason）
- [ ] TemplateStatus 枚举新增 ANALYZING / ANALYSIS_FAILED
- [ ] point-transaction.entity.ts 新增 REWARD 枚举 + templateId 字段
- [ ] 迁移 template/0003 执行成功
- [ ] 迁移 billing/0002 执行成功
- [ ] typecheck 通过

## 阶段 2：billing-service 积分奖励

- [ ] RewardPointsDto 包含 userId/amount/templateId/idempotencyKey
- [ ] LedgerService.reward 方法复用 grant 的幂等机制
- [ ] POST /api/v1/points/reward 端点 @InternalApi 鉴权
- [ ] reward 幂等性测试通过（相同 idempotencyKey 第二次调用不重复发放）
- [ ] reward 余额正确性测试通过（amount > 0 增加余额）

## 阶段 3：Temporal 工作流 + Activities

- [ ] 7 个 Activity 实现（含 Mock 模式降级）
- [ ] template-generation.workflow 串联 7 个 Activity
- [ ] activities.container.ts 装配新 Activity
- [ ] worker.bootstrap.ts 注入 5 个依赖
- [ ] Activity Mock 模式行为测试通过
- [ ] 工作流失败时 finalizeTemplate 标记 ANALYSIS_FAILED

## 阶段 4：template-service 后端

- [ ] UploadTemplateDto 字段校验（assetId 必填 / title 最长 128）
- [ ] BillingClient 调用 /reward 端点
- [ ] submitUpload 创建 ANALYZING 记录 + 启动工作流
- [ ] getUploadStatus 返回 workflow 状态
- [ ] findMyUploaded 按 userId 过滤
- [ ] incrementUseCount 改造：查 userId → 调 reward → 自增
- [ ] incrementUseCount 幂等（idempotencyKey = reward:template:{id}:use:{useCount}）
- [ ] 3 个新端点路由正确
- [ ] template.module.ts 引入 HttpModule
- [ ] 单元测试覆盖 submitUpload / incrementUseCount

## 阶段 5：user-service 公开主页

- [ ] findPublicProfile 聚合查询 templateUploadCount + templateUsedCount
- [ ] GET /users/:id/profile @Public 鉴权
- [ ] 不存在的用户返回 404
- [ ] user.module.ts 引入 Template 实体（template 库）
- [ ] 单元测试覆盖聚合查询

## 阶段 6：小程序前端

- [ ] Template 类型扩展 4 个上传者字段
- [ ] template.api.ts 新增 4 个 API 方法
- [ ] TemplateCard 显示上传者头像 + 昵称 + 统计
- [ ] 上传页支持选视频 → STS 上传 → 提交转模板 → 轮询状态
- [ ] 上传页状态切换：选视频中 / 上传中 / 分析中 / 成功 / 失败
- [ ] 失败时显示原因 + 重试按钮
- [ ] 我的上传页列表 + 状态标签
- [ ] 模板广场接入上传者信息 + 上传入口按钮
- [ ] 小程序 build 通过

## 阶段 7：集成测试 + 发布

- [ ] typecheck 全量 exit 0
- [ ] lint 全量 exit 0
- [ ] 单元测试全量通过（无回归）
- [ ] 小程序 build 通过
- [ ] /review 6 大专项检查无 CRITICAL
- [ ] CHANGELOG 更新
- [ ] commit + push 成功

## 验收标准（Completeness ≥ 7/10）

- [ ] 正常路径覆盖（+3）：用户上传→分析→生成→展示完整流程
- [ ] 边界值覆盖（+2）：空视频 / 超大视频 / 格式不支持
- [ ] 异常路径覆盖（+2）：分析失败 / 积分奖励失败 / 工作流超时
- [ ] 事务一致性（+2）：积分奖励幂等 / 模板状态一致性
- [ ] 幂等性（+1）：incrementUseCount 幂等键防重复奖励
