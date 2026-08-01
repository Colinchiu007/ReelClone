# 生成链路与 Temporal 编排研究

## 结论摘要

- 当前基线是 `master@2ffed0e0b70021aef1c9a514033c938854554f2b`。`9aa4ccb feat: close real-mode generation loop` 已经是 `master` 祖先，并通过 `32e7d24` 合并；确定性 workflow ID、V2 账务预留、Provider 未确认前不退款、重试锁和活动任务条件回写都属于当前实现，不是未合并设想。
- 当前真正可执行的主链路是“视频生成”：小程序/HTTP -> `GenerationService` -> billing freeze -> main DB `Work`/`GenerationTask` -> Temporal -> Seedance -> FFmpeg/OSS/审核 -> settle/release -> DB/Redis 通知。文本/图片生成虽然仍由前端和 API 暴露，但 real mode 会在副作用前拒绝；mock mode 则错误地把所有类型完成成一个假 `.mp4`。
- 最高风险不是 Temporal workflow 定义本身，而是 workflow 外围 saga：mock 完成不终态化账务、Provider 提交没有真正透传幂等键、创建到启动存在多处进程崩溃窗口、Provider 不确定状态没有恢复器，以及 settle 成功后的回写失败会错误转入 release。
- 当前代码比旧 MVP 文档更严格，但文档、前端能力和运行时模式仍明显漂移。不能用 `docs/API.md` 或 README 的“全类型支持/不消耗积分”描述替代 master 代码事实。

## Files Found

- `apps/workbench-service/src/workbench/generation.controller.ts`：生成任务 create/list/detail/cancel/retry HTTP 入口。
- `apps/workbench-service/src/workbench/generation.service.ts`：872 行生成 saga，负责幂等、计费、状态持久化、Temporal 启动、取消和人工重试。
- `apps/workbench-service/src/workbench/dto/create-generation.dto.ts`：8 种公开生成类型及输入契约。
- `apps/workbench-service/src/workbench/points-calculator.util.ts`：生成价格与“视频类型”判定。
- `apps/workbench-service/src/workbench/billing.client.ts`：workbench 到 billing-service 的 freeze/settle/release HTTP 适配。
- `libs/database/src/entities/work.entity.ts`：作品状态、结果、`modelConfig` 控制数据和用户级幂等唯一键。
- `libs/database/src/entities/generation-task.entity.ts`：Provider 任务、尝试次数和四态任务模型。
- `libs/database/src/entities/credit-reservation.entity.ts`：V2 `OPEN -> SETTLED|RELEASED` 权威账务状态机。
- `apps/billing-service/src/billing/credit-reservation.service.ts`：冻结扣减和账务终态约束。
- `libs/temporal/src/temporal.service.ts`：Nest 侧 workflow 启动、查询、取消和确定性 ID。
- `libs/temporal/src/client/temporal.client.ts`：重复的函数式 Temporal Client/启动 API。
- `libs/temporal/src/types.ts`：workflow/activity 合约、Temporal 状态和统一 task queue。
- `libs/temporal/src/workflows/video-generation.workflow.ts`：536 行视频生成 workflow 与补偿路径。
- `libs/temporal/src/activities/seedance.activities.ts`：Temporal 到 Seedance 的参数/状态适配。
- `libs/temporal/src/activities/billing.activities.ts`：worker 到 billing-service 的终态化调用。
- `libs/temporal/src/activities/media.activities.ts`：下载、FFmpeg、封面和当前审核实现。
- `libs/temporal/src/activities/oss.activities.ts`：OSS 上传与 15 分钟签名 URL。
- `libs/temporal/src/activities/notification.activities.ts`：main DB 状态适配入口与 Redis Pub/Sub 通知。
- `libs/temporal/src/activities/activity-context.ts`：worker 全局依赖容器。
- `apps/media-worker/src/worker/workflow-state.store.ts`：Temporal 状态到 main DB 状态的映射与活动任务保护。
- `apps/media-worker/src/worker/worker.bootstrap.ts`：Nest Provider/DB/Redis/OSS 装配。
- `libs/temporal/src/worker/temporal.worker.ts`：真正注册 workflow/activity 的 Temporal Worker。
- `libs/ai/src/seedance/seedance.provider.ts`：具体 Seedance HTTP Provider、多 Key、内部 mock。
- `libs/ai/src/seedance/seedance.types.ts`：Seedance 请求/状态类型。
- `libs/ai/src/llm/llm.provider.ts`：已有 LLM concrete provider，但未接到 `/generations` 文本生成。
- `apps/miniprogram/src/pages/workbench/text/index.tsx`、`image/index.tsx`：仍提交 `TEXT_GENERATE`/`IMAGE_GENERATE` 的用户入口。
- `README.md`、`docs/API.md`、`docs/DEPLOYMENT.md`：部分内容已落后于 master，队列迁移说明除外。

## Dependencies

### 主调用链

```text
miniprogram workbench pages
  -> POST /generations
  -> GenerationController.create
  -> GenerationService.create
     -> Redis request lock/cache
     -> main DB Work
     -> BillingClient.freeze -> billing-service -> CreditReservation(OPEN)
     -> main DB GenerationTask + Work.activeGenerationTaskId
     -> TemporalService.startVideoGeneration
        -> Temporal queue reelclone-tasks
        -> videoGenerationWorkflow
           -> updateWorkStatus
           -> submitToSeedance -> SeedanceProvider
           -> querySeedanceTask loop
           -> postProcessVideo -> VideoDownloader/FFmpeg/OSS
           -> generateThumbnail -> FFmpeg/OSS
           -> moderateContent
           -> settleCredits | releaseCredits -> billing-service
           -> TypeOrmWorkflowStateStore -> main DB
           -> Redis Pub/Sub -> notification-service
```

入口证据：控制器直接委托 `GenerationService`（`apps/workbench-service/src/workbench/generation.controller.ts:29-33`）；create 的实际副作用顺序是 Work save、freeze、Task save、workflow start（`apps/workbench-service/src/workbench/generation.service.ts:199-315`）。

### Worker 装配

```text
media-worker AppModule
  -> AiModule: SeedanceProvider, Downloader, FFmpeg, LLM
  -> OSSModule
  -> DatabaseModule(main)
  -> RedisModule
  -> setActivityDependencies(global singleton)
  -> startWorker
     -> workflows/index
     -> allActivities
     -> queue reelclone-tasks
```

依赖由 Nest 容器取出后写入全局 Activity 容器（`apps/media-worker/src/worker/worker.bootstrap.ts:72-105`；`libs/temporal/src/activities/activity-context.ts:51-96`）。`libs/temporal` 因而不是纯 workflow 包：Activity 合约直接引用具体 `SeedanceProvider`/`LlmProvider`/`OSSService` 类型。

### 文本/图片入口现状

- 小程序文本页提交 `TEXT_GENERATE`（`apps/miniprogram/src/pages/workbench/text/index.tsx:82-95`），图片页提交 `IMAGE_GENERATE`（`apps/miniprogram/src/pages/workbench/image/index.tsx:75-89`）。
- real mode 在创建 Work 或冻结前拒绝两种类型（`apps/workbench-service/src/workbench/generation.service.ts:123-134,181-188`）。
- mock mode 不调用 LLM 或图片 Provider，而是对任何 Work 写入假视频 key/URL 并标记完成（`apps/workbench-service/src/workbench/generation.service.ts:614-635`）。
- `LlmProvider.complete/stream` 已存在（`libs/ai/src/llm/llm.provider.ts:90-153`），但只被 prompt/分析能力消费；生成入口没有文本 adapter，仓库中也没有图片生成 adapter。

## Patterns

以下模式应在重构中保留，而不是回退到旧 MVP 行为：

1. **不支持能力 fail closed**：real mode 文本/图片在任何持久化或冻结前拒绝（`apps/workbench-service/src/workbench/generation.service.ts:123-134,181-188`）。
2. **每次 GenerationTask 一个确定性 workflow ID**：`video-gen-{workId}-{generationTaskId}`，允许同一 Work 人工重试且可在启动响应丢失后反查（`libs/temporal/src/temporal.service.ts:43-68`；`apps/workbench-service/src/workbench/generation.service.ts:665-705`）。
3. **账务三阶段稳定键**：freeze/settle/release 使用不同幂等键并持久化 V2 reservation（`apps/workbench-service/src/workbench/generation.service.ts:767-815`）。
4. **Provider 未确认停止前不退款**：轮询异常和取消均先确认 Provider cancellation（`libs/temporal/src/workflows/video-generation.workflow.ts:440-475,501-531`）。
5. **Redis 所有权锁 + DB 行锁**：Lua 只释放自己的锁，人工 retry 在 Work 行锁内声明新活动任务（`apps/workbench-service/src/workbench/generation.service.ts:477-545,845-852`）。
6. **旧 workflow 不覆盖新 Work**：Task 可完成自己的状态，但 Work 只在 `activeGenerationTaskId` 匹配时更新（`apps/media-worker/src/worker/workflow-state.store.ts:137-153`）。
7. **统一队列契约**：三个新 workflow 和 Worker 使用 `reelclone-tasks`（`libs/temporal/src/types.ts:466-478`）。这是当前迁移约束；拆队列必须做显式迁移，不能直接改常量。

## Risks

### Critical

#### C1. Workbench mock 会真实冻结积分，却没有 settle/release

**证据**

- create 无论 mock 与否都会调用 billing freeze，并把 V2 reservation 写入 Work（`apps/workbench-service/src/workbench/generation.service.ts:245-263`）。
- mock 分支随后直接把 Task/Work 标成完成并 return，没有账务终态调用（`apps/workbench-service/src/workbench/generation.service.ts:614-635`）。
- V2 freeze 会立即扣减 `User.currentPoints` 并创建 `OPEN` reservation（`apps/billing-service/src/billing/credit-reservation.service.ts:58-109`）。
- 现有测试明确期待 mock create 调用 freeze，只断言“不调用 Temporal”，未断言 reservation 终态（`apps/workbench-service/src/workbench/generation.service.spec.ts:191-221,269-280`）。

**影响**：本地/测试/演示环境会留下永久 `OPEN` 预留和降低后的可用余额；README 的“不消耗真实积分额度”与事实相反。

**建议**：第一优先级修复。mock 要么完全使用隔离账本且不调用真实 billing，要么同步执行同一 V2 settle/release 协议；禁止“completed + OPEN reservation”组合，并补数据库集成测试。

#### C2. Provider 提交是 at-least-once，但 Provider 请求没有实际幂等键

**证据**

- workflow 对所有 Activity 统一配置最多 3 次尝试（`libs/temporal/src/workflows/video-generation.workflow.ts:68-79`）。
- Activity 把 `idempotencyKey` 放进 `SeedanceTaskParams.idempotentKey`（`libs/temporal/src/activities/seedance.activities.ts:91-106`）。
- `SeedanceProvider.buildRequestBody` 没有把 `idempotentKey` 放进 HTTP body/header（`libs/ai/src/seedance/seedance.provider.ts:303-334`）。
- Provider 自身对任何提交错误都会继续尝试下一把 Key，包括响应可能已丢失的网络/5xx 错误（`libs/ai/src/seedance/seedance.provider.ts:255-292`）。

**影响**：一次用户请求可在 Provider failover 和 Temporal Activity retry 两层创建多个外部任务；只有最后返回的 taskId 被跟踪，造成供应商成本、内容和取消泄漏。workflow 文件头的 “Exactly-Once” 只对幂等 billing 成立，不适用于 Provider/OSS/通知（`libs/temporal/src/workflows/video-generation.workflow.ts:1-12`）。

**建议**：在接入协议验证后真正透传 Provider client token；若 Provider 不支持，先写本地 submission ledger，再按 token 查询恢复，且把“明确拒绝”和“结果未知”分型。对 submit 单独配置 retry，不能对模糊网络错误盲目跨 Key 重提。

#### C3. Work/freeze/task/workflow-start 是非事务 saga，崩溃窗口没有恢复器

**证据**

- create 顺序跨越多次 DB save、billing HTTP 和 Temporal RPC（`apps/workbench-service/src/workbench/generation.service.ts:199-322`）。
- try/catch 能处理返回的异常，但无法处理进程在“Work 已存/已冻结/Task 已存/activeTask 已存/Temporal 已接收”任一点退出。
- 仓库只持久化 `provider_state_unknown`、`provider_cancel_pending`、`workflow_start_unknown`、`billing_release_pending` 标记，没有扫描这些状态并恢复的 generation reconciler；搜索结果只存在写入点（`apps/workbench-service/src/workbench/generation.service.ts:684-694,830-840`；`libs/temporal/src/workflows/video-generation.workflow.ts:478-496`）。
- 历史合并审查也明确记录这些 Provider pending 状态当前不能自动恢复（`.ccg/tasks/archive/2026-08/close-real-mode-generation-loop/review.md:24-29`）。

**影响**：可留下 PENDING Work、孤立 Task、没有 workflow 的 OPEN reservation，或 Provider 正在运行但本地无法定位的执行；用户既不能安全取消也不能 retry。

**建议**：建立持久化 GenerationExecution/command outbox；事务内先记录“需要启动”，dispatcher 以确定性 ID 启动 Temporal。增加按 execution/reservation/provider token 扫描的 reconciler，并为每个中间态定义超时、查询和人工处置路径。

#### C4. settle 成功后的状态回写失败会错误尝试 release 已结算预留

**证据**

- 成功路径先 settle，再更新 Work 为 completed（`libs/temporal/src/workflows/video-generation.workflow.ts:297-318`）。
- Provider 已完成时 `providerTerminal=true`；后续任一异常都会落到通用 `handleFailure`（`libs/temporal/src/workflows/video-generation.workflow.ts:124-128,221-239`）。
- `handleFailure` 第一件事是 release（`libs/temporal/src/workflows/video-generation.workflow.ts:342-365`）。
- V2 reservation 只允许 `OPEN` 转一个终态；已 SETTLED 后用 release key 会被拒绝（`apps/billing-service/src/billing/credit-reservation.service.ts:171-215`）。

**影响**：积分已结算、产物已生成，但 Work 可能仍 PROCESSING，workflow 失败且补偿再次失败；用户、客服和账务看到互相矛盾的终态。

**建议**：将成功协议拆为 `OUTPUT_READY -> SETTLEMENT_PENDING -> SETTLED -> COMPLETION_PENDING -> COMPLETED`。一旦 settlement 决策落盘或 reservation 已 SETTLED，后续错误只能向 completed 收敛，绝不能进入 release 分支；reconciler 负责补写最终状态/通知。

### High

#### H1. HTTP/API 层默认并不具备可重放幂等性

- 未提供 key 时，服务端调用 `generateIdempotencyKey`（`apps/workbench-service/src/workbench/generation.service.ts:150-160`）；该工具把 `Date.now()` 拼进 key，因此同一请求重放得到不同 key（`libs/common/src/utils/idempotency.util.ts:31-49`）。
- 当前小程序 create 调用不传 `idempotencyKey`（`apps/miniprogram/src/services/api/workbench.api.ts:24-29`及文本/图片入口上述调用）。

**影响**：移动网络重试、双击或网关重放可创建两个 Work、两次冻结和两个 Provider 任务。现有 Redis/DB 去重只保护“客户端复用同一个 key”的情况。

**建议**：客户端在一次用户动作开始时生成并持久化 key，HTTP 重试必须复用；服务端若未收到 key，应明确当作非幂等请求或返回需要 key 的错误，不要把 timestamp request ID 称为幂等键。

#### H2. 对外能力大于 real-mode Provider 能力，多个输入被静默丢弃或必然晚失败

- API 暴露 8 种生成类型（`apps/workbench-service/src/workbench/dto/create-generation.dto.ts:4-24`），`isVideoType` 又把 3D/edit/extend 都判定为已支持（`apps/workbench-service/src/workbench/points-calculator.util.ts:84-95`）。
- `EDIT_VIDEO`/`EXTEND_VIDEO` 的 Activity 参数没有设置 Provider 必需的 `videoUrl`/`sourceVideoUrl`（`libs/temporal/src/activities/seedance.activities.ts:91-103`），而 Provider 会因此拒绝（`libs/ai/src/seedance/seedance.provider.ts:235-243`）。
- 3D 被降级成“首帧图生视频”，不是 3D 建模（`libs/temporal/src/activities/seedance.activities.ts:31-49`）。
- DTO `model`/`aspectRatio` 被持久化并传进 workflow（`apps/workbench-service/src/workbench/generation.service.ts:203-218,640-663`），但 Seedance 请求模型来自全局 `SEEDANCE_MODEL`，请求体没有 aspect ratio（`libs/ai/src/seedance/seedance.provider.ts:303-334`）。
- `referenceImages`、`referenceAudio` 没进入真实 Provider 参数；首尾帧/视频的 API 契约是 asset key（`apps/workbench-service/src/workbench/dto/create-generation.dto.ts:113-163`），代码却直接当外部 URL 使用（`apps/workbench-service/src/workbench/generation.service.ts:640-648`）。

**影响**：编辑、延长、3D 等入口在冻结后才失败或生成错误种类的产物；用户选择的模型/比例/参考素材可能无效，价格和实际执行不一致。

**建议**：先用 capability registry 只开放真实完成 E2E 的组合；在 freeze 前执行按 provider/model 的条件校验和资产解析。3D、文本、图片应是独立 adapter/产物类型，不得映射成视频兜底。

#### H3. `duration` 运行时校验与计价不一致

- DTO 文档称只允许 5/10，但运行时只有 `@IsInt()` 和 `@Min(1)`（`apps/workbench-service/src/workbench/dto/create-generation.dto.ts:101-111`）。
- 计价逻辑只在值严格等于 10 时翻倍，其他任意正整数都按 5 秒收费（`apps/workbench-service/src/workbench/points-calculator.util.ts:57-71`）。

**影响**：非法时长可能在冻结后由 Provider 拒绝；若 Provider 接受，则出现明显少计费。

**建议**：使用 `@IsIn([5,10])`/discriminated DTO，并让 quote 与最终提交消费同一个规范化 request。

#### H4. cancellation/pending 设计“资金安全但不可恢复”，API 还误报已取消

- real cancel 只向 Temporal 发请求，明确等待 Provider 确认（`apps/workbench-service/src/workbench/generation.service.ts:428-446`），但 Controller 立即返回 `{ cancelled: true }`（`apps/workbench-service/src/workbench/generation.controller.ts:59-64`）。
- Provider cancel 后只立即 query 一次；异步取消仍为 PROCESSING 就返回 false（`libs/temporal/src/activities/seedance.activities.ts:157-182`）。
- cancellation pending 会把 DB 保持 PROCESSING，然后 workflow 仍以 failed/canceled 结束，没有后续轮询者（`libs/temporal/src/workflows/video-generation.workflow.ts:175-220,478-531`）。

**影响**：用户看到“已取消”，实际上 Provider/资金仍 pending；之后即使 Provider 变成 CANCELED/SUCCEEDED，本地也不会自动 release/settle。超时路径有相同问题。

**建议**：API 返回 202 `cancellationRequested`；状态机增加 `CANCEL_REQUESTED/CANCEL_CONFIRMING/PROVIDER_STATE_UNKNOWN`。用独立 reconciliation workflow/cron 持续 query，最终按 Provider 终态 settle 或 release。

#### H5. 模式判定分散且可形成混合 real/mock

- workbench 只有值严格等于字符串 `true` 才 mock（`apps/workbench-service/src/workbench/generation.service.ts:118-121`）。
- Activity 在未配置时默认 development mock，且还接受 `1`（`libs/temporal/src/activities/mock.util.ts:8-16`）。因此环境变量缺失时，workbench 可启动真实 Temporal，而 worker 执行 mock Activity；mock Activity 不回写 DB/账务。
- Seedance 的 mock 与 Temporal 无关，只由 API key 是否为空决定（`libs/ai/src/seedance/seedance.provider.ts:103-106,151-159`）。
- production 下构造器在异步读取 ConfigStore 前就因 env key 为空抛错，导致“仅在 admin DB 配 Key”无法启动（`libs/ai/src/seedance/seedance.provider.ts:75-100`）。
- OSS 凭据任一缺失会自动 mock，不受 `NODE_ENV` 或 Temporal real mode 约束（`libs/oss/src/config/oss.config.ts:35-70`）。Downloader 缺工具也自动回退 mock（`libs/ai/src/downloader/video-downloader.service.ts:42-74`）。

**影响**：一个“real”部署可能组合 mock Provider/OSS/downloader，花费真实 Provider 成本后失败，或留下无法回写的账务状态。

**建议**：启动时构建单一 immutable `GenerationRuntimeProfile`，逐项探测 Provider/Temporal/OSS/FFmpeg/billing；production/real 任一依赖 mock 或缺失即 readiness 失败。mock 应由 DI 注入不同 adapter，而不是 Activity 内读环境变量。

#### H6. 资产所有权和可访问 URL 未在 freeze 前验证

- Workbench 模块只有 Billing/Template client，没有 Asset client/ownership verifier（`apps/workbench-service/src/workbench/workbench.module.ts:21-29`）。
- 用户提交的 asset key 直接持久化并进入 Provider URL 字段（`apps/workbench-service/src/workbench/generation.service.ts:203-218,640-648`）。

**影响**：恶意客户端可尝试引用其他用户 key；正常 key 也未转换为 Provider 可访问的短期 URL，图生视频可能晚失败。

**建议**：freeze 前通过 asset-service 验证 `owner_subject/userId`、类型、状态和大小；生成 provider-scoped signed URL，审计传给外部 Provider 的素材。

#### H7. 当前“内容审核”不检查实际内容

- real branch 只对 `videoKey` 和 `thumbnailKey` 字符串做关键词过滤（`libs/temporal/src/activities/media.activities.ts:130-190`）。
- 数据库已有 `REJECTED`，但 workflow 把审核拒绝写成 FAILED（`libs/database/src/entities/work.entity.ts:27-35`；`libs/temporal/src/workflows/video-generation.workflow.ts:267-293`）。

**影响**：有害视频/图片只要对象 key 不含黑名单就通过；审核拒绝与技术失败混淆，难以申诉、审计和统计。

**建议**：接真实图像/视频安全服务并保留 provider decision/evidence；状态机使用 `REJECTED`，产物隔离并按政策清理。

#### H8. 15 分钟 workflow timeout 与 Activity 上限不匹配，超时无外部补偿

- workflow execution timeout 固定 15 分钟（`libs/temporal/src/temporal.service.ts:49-64`）。
- 轮询自身计划 10 分钟，且每次 query 的 Activity 时间不包含在 5 秒 sleep 内（`libs/temporal/src/workflows/video-generation.workflow.ts:116-145`；`libs/temporal/src/types.ts:487-493`）。
- 每个 Activity 允许 5 分钟、3 次尝试，后面还有后处理/封面/审核/签名/settle/状态/通知串行链（`libs/temporal/src/workflows/video-generation.workflow.ts:68-79,249-336`）。

**影响**：Temporal server timeout 可在 Provider 已运行、已结算或产物已上传时直接终止 execution，workflow catch 不保证能执行，形成新的 stuck 状态。

**建议**：按阶段设置合理 timeout/retry/heartbeat；execution timeout 留出补偿预算，或移除过短总超时并用业务 deadline + reconciler 收敛。

#### H9. 文档声明的 Temporal TLS 没有进入 Worker 连接

- `.env.example` 声明生产设置 `TEMPORAL_TLS_ENABLED=true`（`.env.example:63-69`）。
- Client 工厂读取 TLS（`libs/temporal/src/client/temporal.client.ts:33-61`），但 Worker `NativeConnection.connect` 只传 address（`libs/temporal/src/worker/temporal.worker.ts:81-99`）。
- `TemporalModule` 注册 `TEMPORAL_OPTIONS`，`TemporalService` 却只注入 `ConfigService`，options token 没有消费者（`libs/temporal/src/temporal.module.ts:45-87`；`libs/temporal/src/temporal.service.ts:20-37`）。

**影响**：TLS-only Temporal 集群上业务 Client 可能可连而 Worker 不可连；模块配置表面生效、实际被忽略。

**建议**：单一 typed Temporal config 同时供 Client/Worker，支持 tls/metadata；启动集成测试验证 namespace、TLS 和 queue。

### Medium

#### M1. 状态机重复且有损

- DB Task 只有 PENDING/RUNNING/COMPLETED/FAILED（`libs/database/src/entities/generation-task.entity.ts:18-24`），DB Work 有 CANCELLED/REJECTED 但无 TIMEOUT（`libs/database/src/entities/work.entity.ts:27-35`），Temporal 又维护一套 lowercase timeout/canceled（`libs/temporal/src/types.ts:11-19`）。
- store 把 Task 的 cancel/timeout/rejected 都映成 FAILED，把 Work timeout 也映成 FAILED（`apps/media-worker/src/worker/workflow-state.store.ts:15-41`）。
- `billingReservation`、`activeGenerationTaskId`、阶段和 Provider 诊断放在非类型化 JSON（`libs/database/src/entities/work.entity.ts:69-75`；`apps/workbench-service/src/workbench/generation.service.ts:203-218`）。

**影响**：查询/API 无法稳定区分业务取消、超时、审核拒绝和技术失败；控制字段缺少约束/索引/版本，迁移与并发更新脆弱。

**建议**：定义一个版本化 execution 状态机和合法转换表；把 workflow/provider/billing identity 与当前阶段正规化为列/实体，JSON 只放非控制型模型参数。

#### M2. Provider 不是可替换端口，多 Key 任务亲和性丢失

- `ActivityDependencies` 直接依赖 concrete `SeedanceProvider`（`libs/temporal/src/activities/activity-context.ts:51-69`），同时 API/DB/Temporal/AI 各有不同 GenerationType/WorkType 枚举和手写映射。
- submit 返回 `keyIndex` 后 Activity 只保留 taskId（`libs/temporal/src/activities/seedance.activities.ts:104-106`）。Provider submit 成功会把 current index 移到下一把 Key，query/cancel 却使用当前全局 index（`libs/ai/src/seedance/seedance.provider.ts:165-205,255-269`）。

**影响**：若 Key 属于不同账号/租户，后续 query/cancel 可能用错凭据；新增 Provider 会复制更多映射和分支。

**建议**：定义 `GenerationProviderAdapter` 端口及 capability/normalized request/result；execution 持久化 provider account/key reference，query/cancel 按任务亲和信息路由。

#### M3. 媒体/通知 Activity 不是幂等资源操作

- postprocess/thumbnail 使用时间戳和随机 key，每次 retry 生成新对象（`libs/temporal/src/activities/media.activities.ts:52-86,94-127`）。
- 临时下载、processed video、thumbnail 没有 `finally` 清理；长跑 worker 会积累文件。
- notification 仅 Redis Pub/Sub publish（`libs/temporal/src/activities/notification.activities.ts:67-121`）；订阅端离线会丢，Activity retry 又可重复写通知。

**影响**：响应丢失/worker crash 后产生孤儿 OSS 对象、重复通知和磁盘增长。

**建议**：对象 key 由 executionId/stage 确定；Activity 使用 heartbeat、临时工作目录和 finally 清理；通知走 transactional outbox/幂等 eventId。

#### M4. 持久化短期 signed URL

- OSS URL 默认仅 15 分钟（`libs/temporal/src/activities/oss.activities.ts:12-54`），成功路径却把 URL 持久化到 Work（`libs/temporal/src/workflows/video-generation.workflow.ts:297-318`）。
- 作品详情直接返回实体，不按 `resultKey` 重签（`apps/workbench-service/src/workbench/work.service.ts:76-97`）。

**影响**：完成 15 分钟后 `resultUrl` 失效，历史作品不可播放。

**建议**：只持久化 key/metadata；读 API 按用户授权动态签名或返回 CDN token。

#### M5. 所有 workflow 共用一个 Worker/queue，存在 noisy-neighbor 和发布耦合

- 视频、对标、模板三个 queue 常量都指向 `reelclone-tasks`（`libs/temporal/src/types.ts:466-478`）。
- 一个 Worker 注册全部 workflows/activities，并共享总并发上限（`libs/temporal/src/worker/temporal.worker.ts:90-99`）。

**影响**：大文件分析/FFmpeg 可挤占视频生成或模板任务；任一 Activity 依赖变更要求整体 Worker 发布。

**建议**：短期保留统一队列以满足当前迁移契约；有容量数据后按 workload 拆 worker/queue，并提供旧队列 drain/兼容计划。

#### M6. Worker/Client 实现重复且装配容易漂移

- `TemporalService` 与 `client/temporal.client.ts` 各自实现 workflow start/status/cancel。
- `apps/media-worker` 构建一份 activities 对象用于日志，但 `startWorker` 实际注册 `libs/temporal` 内的另一份 `allActivities`（`apps/media-worker/src/worker/worker.bootstrap.ts:68-105`；`libs/temporal/src/worker/temporal.worker.ts:16-34,90-99`）。
- `libs/temporal/src/worker/temporal.worker.ts` 文档允许直接 production 启动，但直接入口没有注入 real-mode dependencies（`libs/temporal/src/worker/temporal.worker.ts:7-9,145-152`）。

**影响**：配置、activity 清单和启动路径可产生“测试的是 A，运行的是 B”的漂移。

**建议**：保留一个 Client facade 和一个 Worker factory，activities/dependencies 作为显式参数；移除不能在 real mode 工作的直接入口。

## Current Master vs Old Docs

| 旧描述                                                                                                                                             | 当前 master 事实                                                                                                    | 判断                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `docs/API.md` 声称支持视频/3D/编辑/延长/文本/图片全部生成（`docs/API.md:544-581`）                                                                 | 文本/图片 real mode 前置拒绝；edit/extend 参数映射缺失；3D 只是图生视频 fallback                                    | 旧能力清单，不可作为验收依据          |
| API 响应包含 `status`、`estimatedPoints`（`docs/API.md:583-584`）                                                                                  | `CreateGenerationResult` 只有 `workId/taskId`（`apps/workbench-service/src/workbench/generation.service.ts:71-75`） | 已漂移                                |
| API 流程先 freeze 再创建 Work（`docs/API.md:583`）                                                                                                 | 当前先保存 Work，再用 workId freeze（`apps/workbench-service/src/workbench/generation.service.ts:199-263`）         | 已漂移；当前顺序服务于 V2 reservation |
| README 使用 `SEEDANCE_MOCK_MODE=true` 且“不消耗真实积分”（`README.md:215-227`）                                                                    | 仓库代码不读取该变量；Seedance mock 看 Key，workbench mock 看 `TEMPORAL_MOCK_MODE`，且会 freeze 不终态化            | 危险的旧文档                          |
| `TEMPORAL_MOCK_MODE=false` 即完整 real workflow（`docs/DEPLOYMENT.md:193-206`）                                                                    | Seedance/OSS/downloader 仍可独立自动 mock；Worker TLS 也未接线                                                      | 过度承诺                              |
| 新 workflow 统一 `reelclone-tasks`（`docs/DEPLOYMENT.md:654-664`）                                                                                 | 与 `TASK_QUEUE` 和 Worker 一致                                                                                      | 当前有效                              |
| archived CCG review 表示 Provider pending 无自动恢复、未跑真实 E2E（`.ccg/tasks/archive/2026-08/close-real-mode-generation-loop/review.md:24-29`） | 当前搜索与测试仍未发现恢复器/真实环境测试                                                                           | 历史记录仍准确，但不是生产验证        |

## Test Evidence And Gaps

本研究运行：

```text
npm run test:unit -- \
  apps/workbench-service/src/workbench/generation.service.spec.ts \
  libs/temporal/src/workflows/video-generation.workflow.spec.ts \
  libs/temporal/src/activities/seedance.activities.spec.ts \
  apps/media-worker/src/worker/workflow-state.store.spec.ts \
  --runInBand

4 suites passed, 53 tests passed
```

通过证明的是 mock/unit 层的当前约定。仍缺：

- workflow spec 只有 4 个 Provider 安全场景（`libs/temporal/src/workflows/video-generation.workflow.spec.ts:51-118`），没有成功、审核拒绝、timeout、Temporal cancellation、settle 后回写失败。
- 没有 `SeedanceProvider` 单测覆盖 request body、模糊提交错误、跨 Key affinity、未知状态映射。
- 没有 `@temporalio/testing`/`TestWorkflowEnvironment` replay 测试，也没有真实 Postgres/Redis/Temporal/billing/OSS/Seedance 集成测试。
- 没有 crash injection 覆盖 create saga 的五个持久化/RPC 窗口。
- 没有断言“每个完成/失败 execution 的 reservation 最终非 OPEN”的系统不变量。
- 本研究未运行全仓测试；上述结果不能外推为 production E2E 通过。

## Recommended Refactor Order

### 0. 立即止损（高价值，低到中成本）

1. 修复 mock completion 的 reservation 终态；增加数据库级 invariant 测试。
2. 把 runtime duration 校验收紧为 5/10；freeze 前执行按 generation type 的条件参数校验。
3. 暂时从 real capability 列表关闭 edit/extend/3D/text/image，直到各自 contract E2E 通过；同步前端 feature flag 与 API docs。
4. 真正传递 Provider idempotency token；在不明确 Provider 契约前关闭模糊错误的跨 Key 自动重提。
5. cancel API 改为 `cancellationRequested`，不再返回已取消。

### 1. 先建立可恢复执行账本（最高架构优先级）

1. 新建规范化 `GenerationExecution`（或扩展 `GenerationTask`）字段：`workflowId/runId/providerTaskId/providerAccountRef/clientToken/state/billingReservationId/activeAttempt/version/deadline/errorClass`。
2. 定义唯一状态机和转换表，显式表示 validation、queued、provider submitting/unknown/running/cancel confirming、output ready、settlement pending/settled、completion pending、completed/released/rejected/failed。
3. Work/Task/“启动命令”同一 DB 事务落盘；outbox dispatcher 用确定性 workflow ID 投递。
4. 增加 reconciler：扫描过期中间态，交叉查询 Temporal、Provider 和 CreditReservation，保证在 SLO 内收敛或告警。

### 2. 重构 Provider/能力边界

1. 定义 `GenerationProviderAdapter`：`capabilities`、`normalizeAndValidate`、`submit(clientToken)`、`query(locator)`、`requestCancel`、`recoverByToken`。
2. 将 API DTO 转成 discriminated requests；文本、图片、视频、3D 是不同产物契约，不再互相 fallback。
3. 增加 AssetResolver：所有权、媒体类型、大小、可访问 URL 和外部传输审计。
4. 持久化 provider credential/account affinity；model/aspect/audio/reference 参数必须由 contract test 证明到达 Provider。

### 3. 让 Temporal 负责可恢复编排，而不是承载模糊补偿

1. submit/query/cancel/media/billing/notification 分别设置 retry/non-retry error、timeout、heartbeat 和确定性资源 key。
2. cancellation 改成可持续轮询/恢复的状态，而非一次 query 后终止 workflow。
3. 成功账务协议采用 forward recovery：SETTLED 后只向 COMPLETED 前进，绝不 release。
4. 调整 execution timeout，保留足够补偿预算；用业务 deadline 驱动 provider cancel/reconcile。
5. typed config 同时驱动 Client/Worker，补 TLS/readiness；移除隐式混合 mock。

### 4. 收口媒体、安全和交付副作用

1. 实际内容审核、REJECTED 状态、隔离/清理策略。
2. OSS key 以 execution/stage 确定；临时目录 finally 清理；重试不制造孤儿对象。
3. 仅持久化 result key，读时鉴权重签 URL。
4. 通知改 outbox + eventId 幂等；Redis/WebSocket 只是投递通道，不是唯一事实来源。

### 5. 最后拆包/扩容并更新文档

1. 将 Temporal workflow contract、activity ports 和具体 infra adapters 分包；删除重复 Client/Worker 装配。
2. 有容量指标后再拆视频/分析/模板 queue，并执行 drain 迁移。
3. 用 OpenAPI/能力矩阵生成前端类型和文档；README 只描述真实可验收模式。
4. 建立 `TestWorkflowEnvironment` replay/failure-injection、Testcontainers 集成测试和一条真实 sandbox Provider E2E。

## Acceptance Invariants

- 同一个 client action/Provider client token 在 HTTP retry、Activity retry、worker crash 后最多产生一个可计费 Provider execution。
- 每个 execution 的 CreditReservation 在 deadline 内到达 SETTLED 或 RELEASED；超时必须进入可查询告警队列，不能静默 OPEN。
- `COMPLETED` 必须同时满足：产物存在、reservation SETTLED、active execution 匹配；`RELEASED` 后不能完成，`SETTLED` 后不能失败退款。
- API 的 `cancelled` 只在 Provider 终态已确认且 reservation RELEASED 后出现；此前只能是 cancellation requested/confirming。
- production real profile 不允许任何 Seedance/OSS/downloader/billing/Temporal dependency 处于 mock 或未探测状态。
- 每个公开 generation type/model/input 组合都必须有 contract test，未通过的能力不进入 API enum/前端入口。
