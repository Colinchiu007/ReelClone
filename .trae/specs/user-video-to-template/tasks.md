# Tasks: 用户上传视频转模板功能

> 质量节拍 Phase 1.3 任务拆解
> 7 个阶段 / 28 个任务
> **状态：全部完成 ✅（2026-07-30）**

---

## 阶段 1：数据库 + 实体（基础设施）

- [x] T1.1 [template.entity.ts] 新增字段：sourceAssetId / videoMeta / analysisReport / workflowId / failureReason + 状态枚举 ANALYZING / ANALYSIS_FAILED
- [x] T1.2 [point-transaction.entity.ts] 新增 REWARD 枚举值 + templateId 字段
- [x] T1.3 [迁移 template/0003] 新增字段 + 扩展枚举
- [x] T1.4 [迁移 billing/0002] 扩展枚举 + 新增 template_id 列

## 阶段 2：billing-service 积分奖励

- [x] T2.1 [reward-points.dto.ts] 新建 DTO
- [x] T2.2 [ledger.service.ts] 新增 reward 方法（复用 grant 逻辑，放宽 orderId 约束）
- [x] T2.3 [billing.controller.ts] 新增 POST /api/v1/points/reward（@InternalApi）
- [x] T2.4 [billing.service.spec.ts] reward 幂等性 + 余额正确性测试

## 阶段 3：Temporal 工作流 + Activities

- [x] T3.1 [template.activities.ts] 新建 7 个 Activity：downloadAssetVideo / extractVideoMeta / generateThumbnail / analyzeVideo / summarizeTemplate / uploadThumbnail / finalizeTemplate
- [x] T3.2 [template-generation.workflow.ts] 新建工作流
- [x] T3.3 [activities.container.ts] 装配新 Activity
- [x] T3.4 [worker.bootstrap.ts] 注入依赖：OSSService / FfmpegService / VideoAnalyzerService / LlmProvider / TemplateService
- [x] T3.5 [template.activities.spec.ts] Mock 模式行为验证

## 阶段 4：template-service 后端

- [x] T4.1 [upload-template.dto.ts] 新建 DTO
- [x] T4.2 [billing.client.ts] 新建 HTTP 客户端调用 billing /reward
- [x] T4.3 [template.service.ts] 新增 submitUpload（创建 ANALYZING 记录 + 启动工作流）/ getUploadStatus / findMyUploaded
- [x] T4.4 [template.service.ts] 改造 incrementUseCount：查 userId → 调 reward → 自增
- [x] T4.5 [template.controller.ts] 新增 POST /upload / GET /upload/:wfId/status / GET /my-uploaded
- [x] T4.6 [template.module.ts] 引入 HttpModule 注册 BillingClient
- [x] T4.7 [template.service.spec.ts] submitUpload / incrementUseCount reward 调用测试

## 阶段 5：user-service 公开主页

- [x] T5.1 [user.service.ts] 新增 findPublicProfile（聚合查询 template 库）
- [x] T5.2 [user.controller.ts] 新增 GET /users/:id/profile（@Public）
- [x] T5.3 [user.module.ts] 引入 Template 实体（template 库连接）
- [x] T5.4 [user.service.spec.ts] findPublicProfile 聚合查询测试

## 阶段 6：小程序前端

- [x] T6.1 [types/index.ts] 扩展 Template 类型：authorAvatar / authorId / authorUploadCount / authorUsedCount
- [x] T6.2 [template.api.ts] 新增 uploadTemplate / getUploadStatus / listMyUploaded / getUserProfile
- [x] T6.3 [TemplateCard] 显示上传者头像 + 昵称 + 上传数 + 被使用数
- [x] T6.4 [pages/template/upload] 上传视频转模板页（选视频→上传→分析中→成功/失败）
- [x] T6.5 [pages/template/my-uploaded] 我的上传页
- [x] T6.6 [pages/template/gallery] 接入新字段 + 上传入口按钮

## 阶段 7：集成测试 + 发布

- [x] T7.1 typecheck 全量 ✅
- [x] T7.2 lint 全量 ✅
- [x] T7.3 单元测试全量（51 suites / 596 tests）✅
- [x] T7.4 小程序 build ✅
- [x] T7.5 /review 审查（6 大专项）— 1 项必须修复（内部端点鉴权）已修复 ✅
- [x] T7.6 /ship 发布（commit 72a259d 推送到 origin/master）✅

## 额外完成项（不在原计划内）

- [x] A1 InternalApiKeyGuard + @InternalApi 提升到 @reelclone/common（安全加固）
- [x] A2 template-service 4 个内部端点加 @InternalApi 鉴权
- [x] A3 template.activities.ts axios 补充 x-api-key + 10s timeout
- [x] A4 uuid 降级 11→8.3.2（Taro 兼容性）
- [x] A5 webpack 锁定 5.78.0（Taro 3.6.27 兼容性）
- [x] A6 scss /deep/ → & ::v-deep（privacy + user-agreement）

## 后续待办（建议改进项，下迭代处理）

- [ ] B1 reward 幂等键并发竞态修复（悲观锁或 DB 序列号）
- [ ] B2 reward 失败补发机制（对账任务）
- [ ] B3 submitUpload 原子性（ANALYZING 超时对账任务）
- [ ] B4 LLM 输出 Schema 校验（class-validator）
- [ ] B5 Prompt Injection 防护（OCR/ASR 文本脱敏）
- [ ] B6 billing.client 重试/熔断
- [ ] B7 upload 页轮询 404 立即失败 + 最大重试次数
- [ ] B8 前后端类型对齐（workflowId/avatarUrl/templateId/TemplateStatus）
