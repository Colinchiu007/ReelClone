# ReelClone 项目经验沉淀 (Learnings)

> 质量节拍 Phase 4.3 产出物 — 跨会话可查的经验库
> 格式遵循质量节拍 12.11 Learnings 系统增强规范

---

## 2026-07-30 复盘批次（抖音复刻链路 Gap 修复）

### L-001 [pattern] Activity 真实模式依赖注入模式

**场景**: Temporal Activity 需要调用 NestJS 容器中的服务（VideoDownloaderService 等），但 Activity 是纯函数，无法直接 DI。

**模式**: 在 Worker 启动时通过 `setActivityDependencies()` 注入 Nest 容器中的服务实例，Activity 内部通过 `getActivityDependencies()` 获取。ActivityDependencies 接口扩展新字段时，需同步：

1. `activity-context.ts` 接口定义
2. `worker.bootstrap.ts` 注入逻辑
3. Activity 实现中通过解构获取依赖
4. 新增对应单元测试

**置信度**: 9/10（已验证 3 个 Activity 真实模式接入）
**来源**: observed
**关联文件**: [activity-context.ts](file:///d:/Data/projects/ReelClone/libs/temporal/src/activities/activity-context.ts), [worker.bootstrap.ts](file:///d:/Data/projects/ReelClone/apps/media-worker/src/worker/worker.bootstrap.ts)

---

### L-002 [pitfall] Context.current() 在单元测试中返回新对象导致断言失败

**场景**: Activity 单元测试中 mock `@temporal/sdk` 的 `Context.current()`，每次调用返回新对象，导致 `ctx.log.info` 断言失败（mock 函数引用不一致）。

**根因**: `Context.current()` 在测试中被 mock 为 `jest.fn(() => ({ log: { info: jest.fn() } }))`，每次调用生成新对象。

**修复**: 使用单例 mockContext 对象：

```typescript
const mockContext = { log: { info: jest.fn() } }
jest.mock('@temporal/sdk', () => ({
  Context: { current: jest.fn(() => mockContext) },
}))
```

**置信度**: 10/10（已修复并验证）
**来源**: observed
**关联文件**: [media.activities.spec.ts](file:///d:/Data/projects/ReelClone/libs/temporal/src/activities/media.activities.spec.ts)

---

### L-003 [pitfall] inferRecommendParams 逻辑变更未同步测试数据

**场景**: 改进 `inferRecommendParams` 从关键词匹配改为基于 `shotList` 聚合时长推断后，原测试用例（横屏风格期望 10s）失败，因为默认 shotList 合计 5s 被映射到 5s 档位。

**根因**: 测试数据 `buildReport` 默认 shotList 合计 5s，横屏测试用例未同步更新 shotList 时长。

**修复**: 新增 `buildLongShotList()` 构造合计 10s 的 shotList，3 个横屏测试用例显式传入 `shotList: buildLongShotList()`。

**预防**: 改动推断逻辑时，必须检查所有依赖该逻辑的测试数据是否符合新逻辑的输入假设。

**置信度**: 9/10
**来源**: observed
**关联文件**: [prompt-engine.service.spec.ts](file:///d:/Data/projects/ReelClone/libs/ai/src/llm/prompt-engine.service.spec.ts)

---

### L-004 [pitfall] PowerShell heredoc 不支持 `$(cat <<'EOF' ... EOF)`

**场景**: 在 PowerShell 中执行 git commit 使用 heredoc 语法传递多行 commit message，报错 `Missing file specification after redirection operator`。

**根因**: PowerShell 不支持 bash 的 heredoc 语法。

**修复**: 改用单行 commit message（双引号包裹，内部无换行），或使用多个 `-m` 参数：

```powershell
git commit -m "标题" -m "正文行1" -m "正文行2"
```

**置信度**: 10/10
**来源**: observed

---

### L-005 [operational] Windows TRAE 环境下 npm/node PATH 问题

**场景**: TRAE 终端默认 PATH 中无 npm/node，直接 `npm run xxx` 报 "npm not recognized"。

**环境配置**:

- node 位置: `C:\Users\邱领\AppData\Local\hermes\node`
- npm 全局位置: `D:\Program Files\npm-global`
- Node 版本: v22.22.3, npm 10.9.8

**解决**: 每次执行 npm 命令前显式设置 PATH：

```powershell
$env:PATH = "C:\Users\邱领\AppData\Local\hermes\node;D:\Program Files\npm-global;$env:PATH"
```

**置信度**: 10/10
**来源**: observed

---

### L-006 [pattern] 视频下载器 cookies 透传模式

**场景**: 抖音等平台需要 cookies 才能下载视频，lux 和 yt-dlp 两个下载器需保持一致行为。

**模式**: 通过 `VIDEO_DOWNLOADER_COOKIES` 环境变量统一配置 cookies 文件路径，两个下载器在调用时都传递该参数：

- yt-dlp: `--cookies <path>`
- lux: `-C <path>` 或通过环境变量

**置信度**: 9/10
**来源**: observed
**关联文件**: [video-downloader.service.ts](file:///d:/Data/projects/ReelClone/libs/ai/src/downloader/video-downloader.service.ts)

---

### L-007 [architecture] ConfigStore onKeyUpdate 回调机制

**场景**: Provider（Seedance/LLM）的 API Key 在内存中缓存，ConfigStore 更新数据库中的 Key 后，Provider 需要主动刷新内存。

**架构**: ConfigStore 提供 `onKeyUpdate(callback)` 注册方法，Provider 在模块初始化时注册回调，Key 变更时 ConfigStore 主动调用所有回调，Provider 在回调中执行 `reloadKeys()` 从数据库重新加载。

**关键点**:

1. 回调返回 Promise，ConfigStore 用 async/await 处理（不能直接传给 void 类型参数）
2. 多个 Provider 可注册多个回调，互不影响
3. 回调失败不应阻塞其他回调

**置信度**: 9/10
**来源**: observed
**关联文件**: [config-store.service.ts](file:///d:/Data/projects/ReelClone/libs/common/src/config/config-store.service.ts)

---

### L-008 [pattern] 退款事务保护「先下游后状态」模式

**场景**: 退款流程涉及微信退款 API + 积分扣回 + 订单状态更新，任一步失败都会导致数据不一致。

**模式**: 调整顺序为「先调用下游服务 → 成功后再更新订单状态」：

1. 调用微信退款 API（失败直接抛错，订单仍 PAID 可重试）
2. 扣回用户积分（失败记录审计日志，订单仍 PAID 可重试）
3. 标记订单 REFUNDED（只有前两步成功才执行）

失败时记录审计日志（FAILURE/PARTIAL），订单保持 PAID 状态可重试。

**置信度**: 10/10
**来源**: observed
**关联文件**: [admin-order.service.ts](file:///d:/Data/projects/ReelClone/apps/admin-service/src/admin-order/admin-order.service.ts)

---

### L-009 [pattern] 广播通知分批并发推送

**场景**: 10w 用户广播通知，for 循环逐个 await 推送耗时过长。

**模式**: 分批并发推送，每批 50 个用户，使用 `Promise.allSettled` 处理（部分失败不影响整体）：

```typescript
const BATCH_SIZE = 50
for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
  const batch = userIds.slice(i, i + BATCH_SIZE)
  await Promise.allSettled(batch.map((id) => notifyUser(id, payload)))
}
```

**置信度**: 10/10
**来源**: observed
**关联文件**: [admin-notification.service.ts](file:///d:/Data/projects/ReelClone/apps/admin-service/src/admin-notification/admin-notification.service.ts)

---

### L-010 [pitfall] LLM Mock 输出与输入关联弱导致下游联调失效

**场景**: LLM Mock 模式返回固定模板文案，与输入 prompt 关联度低，下游功能（对标解析、复刻提示词）联调时无法验证数据流。

**根因**: `buildMockText` 方法未区分调用场景，统一返回相同文本。

**修复**: 重构 `buildMockText`，根据 system prompt 关键词识别调用场景：

- 包含「对标解析」→ 返回结构化 JSON 报告
- 包含「复刻提示词」→ 返回镜头描述文本
- 包含「文案生成」→ 返回 hook+body+cta 结构
- 默认 → 返回通用文本

**置信度**: 9/10
**来源**: observed
**关联文件**: [llm.provider.ts](file:///d:/Data/projects/ReelClone/libs/ai/src/llm/llm.provider.ts)

---

## Skillify 检查

**检查规则**: 同类型 pattern 出现 3 次以上 → 触发 skillify 候选

| 候选模式                        | 出现次数                        | 是否生成 skill      |
| ------------------------------- | ------------------------------- | ------------------- |
| Activity 依赖注入模式 (L-001)   | 3 次（seedance/media/analyzer） | ❌ 项目特定，不通用 |
| 测试数据同步逻辑变更 (L-003)    | 1 次                            | ❌ 次数不足         |
| 事务保护「先下游后状态」(L-008) | 1 次                            | ❌ 次数不足         |
| 分批并发推送 (L-009)            | 1 次                            | ❌ 已是通用模式     |

**结论**: 本次无 skillify 候选，learnings 已写入 `01-docs/learnings.md`。

---

## 过期检测

本次批次为首次写入，无过期检测需求。后续批次会检查：

- 引用文件已被删除 → 标记 STALE
- 同 key 矛盾内容 → 标记 CONFLICT
- 超过 90 天未引用 → 标记 AGED

---

## 2026-07-30 复盘批次（E2E 集成测试打通）

### L-011 [pitfall] E2E tsconfig 缺少装饰器配置导致 TypeORM 实体编译失败

**场景**: E2E 测试独立 tsconfig（`tests/integration/tsconfig.json`）未启用 `experimentalDecorators` 和 `emitDecoratorMetadata`，导致 TypeORM 实体类（User/Work 等）的 `@Column`/`@OneToMany` 装饰器编译报错 "Unable to resolve signature of property decorator when called as an expression"。

**根因**: E2E tsconfig 从基础配置复制时遗漏了装饰器相关选项。根 tsconfig.base.json 有这两个选项，但 E2E 独立配置未同步。

**修复**: 在 `tests/integration/tsconfig.json` 中添加 `experimentalDecorators: true` + `emitDecoratorMetadata: true` + `baseUrl` + `paths`（与 tsconfig.base.json 对齐）。

**置信度**: 10/10（修复后 10 套件 95 测试全通过）
**来源**: observed
**关联文件**: [tsconfig.json](file:///d:/Data/projects/ReelClone/tests/integration/tsconfig.json), [tsconfig.base.json](file:///d:/Data/projects/ReelClone/tsconfig.base.json)

---

### L-012 [pitfall] SMS 60 秒限流键不区分 purpose 导致跨用例冲突

**场景**: user.api.spec.ts 中「绑定手机号」测试发送 `BIND_MOBILE` 验证码后，「设置密码」测试对同一手机号发送 `RESET_PASSWORD` 验证码，触发 60 秒限流（`sms:lockout:{mobile}` 键不区分 purpose）。

**根因**: SmsService 的限流键为 `sms:lockout:{mobile}`，不包含 purpose 维度。同一手机号 60 秒内只能发送一次验证码，无论用途是否相同。

**修复**: E2E 测试中「设置密码」用例使用独立的新手机号（`randomMobile()`），避免与前序测试的限流冲突。

**置信度**: 9/10
**来源**: observed
**关联文件**: [sms.service.ts](file:///d:/Data/projects/ReelClone/apps/user-service/src/user/sms.service.ts), [user.api.spec.ts](file:///d:/Data/projects/ReelClone/tests/integration/api/user.api.spec.ts)

---

### L-013 [pitfall] 改密踢下线机制导致后续测试 JWT 失效

**场景**: user.api.spec.ts 中「设置密码」测试触发 `revokeAllTokens()`，在 Redis 写入 `user:password-changed:{userId}` 键（TTL 7 天）。后续「行业偏好」测试使用同一 JWT token 请求，被 JwtStrategy 的改密检查拦截返回 401。

**根因**: `changePassword()` 方法在保存新密码后立即设置 Redis 黑名单键，使当前 token 失效。如果密码修改测试不是最后一个需要认证的用例，后续测试都会 401。

**修复**: 调整测试执行顺序 — 将「行业偏好」describe 块移到「PUT /users/password」之前，确保密码修改是最后一个使用当前 token 的测试。

**置信度**: 10/10
**来源**: observed
**关联文件**: [jwt.strategy.ts](file:///d:/Data/projects/ReelClone/apps/user-service/src/auth/jwt.strategy.ts), [user.service.ts](file:///d:/Data/projects/ReelClone/apps/user-service/src/user/user.service.ts)

---

### L-014 [pattern] Mock 模式应立即标记任务 COMPLETED 而非 RUNNING

**场景**: workbench-service 和 benchmark-service 的 Mock 模式原本只设置 `providerTaskId` 但保持状态为 RUNNING，导致 E2E 测试轮询任务状态超时。

**模式**: Mock 模式下不调用 Temporal，应立即：

1. 更新 GenerationTask 状态为 COMPLETED + 设置 startedAt/completedAt
2. 更新 Work 状态为 COMPLETED + 填充 mock resultUrl/thumbnailKey
3. 对于 benchmark，写入 mock analysisResult

这样 E2E 测试可以同步验证完整流程，无需轮询等待。

**置信度**: 10/10（E2E 全部通过）
**来源**: observed
**关联文件**: [generation.service.ts](file:///d:/Data/projects/ReelClone/apps/workbench-service/src/workbench/generation.service.ts), [benchmark.service.ts](file:///d:/Data/projects/ReelClone/apps/benchmark-service/src/benchmark/benchmark.service.ts)

---

### L-015 [pitfall] TypeORM jsonb 列 update 时不应使用 as unknown as Record cast

**场景**: `benchmark.service.ts` 中 `repo.update()` 调用对 `analysisResult` 字段使用了 `as unknown as Record<string, unknown>` 强制转换，导致 TS2322 类型错误：`Record<string, unknown>` 不兼容 TypeORM 的 `_QueryDeepPartialEntity` 类型。

**根因**: TypeORM 的 `update()` 方法对 jsonb 列类型有严格的 `QueryDeepPartialEntity` 泛型约束，`Record<string, unknown>` 的索引签名类型无法满足。内联对象字面量（如 `{ step: 'freeze', message: '...' }`）可以自动推断兼容。

**修复**: 移除 `as unknown as Record<string, unknown>` cast，直接传递对象变量。TypeScript 会推断具体类型，自动兼容 `QueryDeepPartialEntity`。

**置信度**: 9/10
**来源**: observed
**关联文件**: [benchmark.service.ts](file:///d:/Data/projects/ReelClone/apps/benchmark-service/src/benchmark/benchmark.service.ts)

---

### L-016 [architecture] 跨库实体关系用逻辑 ID 字段而非 TypeORM 装饰器

**场景**: User/Work 实体通过 `@ManyToOne`/`@OneToMany` 关联跨库的 Benchmark/Favorite/PointTransaction 实体，导致 TypeORM 启动报错 "Entity metadata for Work#benchmark was not found"。

**模式**: 多数据库架构下，跨库实体关联应：

1. 移除所有跨库 `@ManyToOne`/`@OneToMany`/`@JoinColumn` 装饰器
2. 保留逻辑关联 ID 字段（如 `benchmarkId: string | null`）
3. 在代码注释中标注跨库逻辑关联
4. 应用层通过服务间调用（HTTP/gRPC）补全关联数据

同库内的实体关系（如 User ↔ Work，均在 main 库）可正常使用 TypeORM 装饰器。

**置信度**: 10/10（5 个实体修复后全部通过）
**来源**: observed
**关联文件**: [user.entity.ts](file:///d:/Data/projects/ReelClone/libs/database/src/entities/user.entity.ts), [work.entity.ts](file:///d:/Data/projects/ReelClone/libs/database/src/entities/work.entity.ts), [benchmark.entity.ts](file:///d:/Data/projects/ReelClone/libs/database/src/entities/benchmark.entity.ts)

---

### L-017 [operational] 微服务重启前必须清理残留端口进程

**场景**: E2E 测试重启微服务时，旧进程仍占用 3001-3009 端口，导致新进程 EADDRINUSE 启动失败。start-e2e.ps1 的健康检查误判为"OK"（实际是旧进程在监听），但旧进程运行的是过期代码。

**模式**: 每次重启微服务前，先执行端口清理脚本 `kill-e2e-ports.ps1`：

```powershell
$ports = 3001..3009
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        Stop-Process -Id $conn.OwningProcess -Force
    }
}
```

**置信度**: 10/10（多次验证）
**来源**: observed
**关联文件**: [kill-e2e-ports.ps1](file:///d:/Data/projects/ReelClone/tools/kill-e2e-ports.ps1)

---

## Skillify 检查（E2E 批次）

| 候选模式                  | 出现次数                    | 是否生成 skill        |
| ------------------------- | --------------------------- | --------------------- |
| Mock 立即完成模式 (L-014) | 2 次（workbench+benchmark） | ❌ 项目特定，不通用   |
| 跨库逻辑 ID 关联 (L-016)  | 5 个实体                    | ❌ TypeORM 通用知识   |
| 端口清理脚本 (L-017)      | 多次                        | ❌ 运维操作，非 skill |

**结论**: 本次无 skillify 候选。

---

## 2026-07-30 复盘批次（Phase 5 运营期加固）

### L-018 [pitfall] npm overrides 在 workspaces 嵌套 node_modules 中不生效

**场景**: 根 package.json 添加 overrides 强制升级 tar/brace-expansion/uuid 版本，但 `npm audit` 显示漏洞数未减少。检查发现 apps/*/node_modules 下的嵌套依赖仍为旧版本，不受根 overrides 控制。

**根因**: npm workspaces 中，当子包与根包的依赖版本范围冲突时，npm 会在子包目录下安装兼容版本。这些嵌套的 node_modules 不受根 package.json overrides 影响。`npm dedupe` 也无法解决，因为子包的 package.json 锁定了特定版本范围。

**修复**:

1. 删除嵌套的 `apps/*/node_modules` 中的特定旧版包（如 `apps/auth-service/node_modules/bcrypt`）
2. 在子包 package.json 中直接升级依赖版本（如 bcrypt `^5.1.1` → `^6.0.0`）
3. 删除 `package-lock.json` 后重新 `npm install --legacy-peer-deps`，强制 npm 重新解析依赖树

**预防**: 升级安全漏洞依赖时，不仅修改根 package.json，还需同步修改所有子包的 package.json，并清理嵌套 node_modules。

**置信度**: 9/10
**来源**: observed
**关联文件**: [package.json](file:///d:/Data/projects/ReelClone/package.json), [auth-service/package.json](file:///d:/Data/projects/ReelClone/apps/auth-service/package.json)

---

### L-019 [architecture] 可观测性库设计与接入分离

**场景**: 项目有独立的 `libs/observability` 库（Pino 结构化日志 + Prometheus 指标 + 健康检查端点），设计完善且导出清晰，但 9 个微服务均未接入。仅 auth-service 和 admin-service 有手写的简单 /health 端点。

**模式**: 可观测性库应作为基础设施先行建设，但接入需分阶段：

1. **库设计阶段**：定义统一的 LoggerService/HealthModule/MetricsModule 接口
2. **试点接入**：选择 1-2 个核心服务（如 auth/user）先接入，验证可用性
3. **全面推广**：逐步接入其他服务，替换 console.log/NestJS 默认 Logger

**当前状态**: 库已就绪但未接入（技术债）。后续需逐服务接入，优先接入 auth/user/workbench（核心业务路径）。

**置信度**: 8/10
**来源**: observed
**关联文件**: [observability/index.ts](file:///d:/Data/projects/ReelClone/libs/observability/src/index.ts), [logger.service.ts](file:///d:/Data/projects/ReelClone/libs/observability/src/logger/logger.service.ts)

---

### L-020 [operational] 安全漏洞修复的现实策略：接受框架级漏洞

**场景**: `npm audit` 显示 38 个漏洞（5 critical / 14 high / 19 moderate），但其中大多数来自框架传递依赖：

- critical tar: 来自 bcrypt 构建链（运行时不触发）
- critical swiper/multer: 来自 Taro/NestJS（需大版本升级）
- high brace-expansion: 来自 typeorm/glob（需 typeorm 0.4）

**模式**: 安全漏洞修复应分优先级：

1. **P0 直接依赖漏洞**: 立即升级（如 bcrypt 5→6、uuid 10→11）
2. **P1 传递依赖漏洞**: 用 npm overrides 尝试修复，失败则评估风险
3. **P2 框架级漏洞**: 需要框架大版本升级（NestJS 10→11、Taro 3.6→4），记录为技术债，在专项升级周期处理

**关键判断**: 漏洞的实际风险取决于攻击面。tar 漏洞只在解压恶意 tar 文件时触发，生产环境不暴露该攻击面，可接受。

**置信度**: 9/10
**来源**: observed
**关联文件**: [package.json](file:///d:/Data/projects/ReelClone/package.json)

---

## Skillify 检查（Phase 5 批次）

| 候选模式                   | 出现次数 | 是否生成 skill        |
| -------------------------- | -------- | --------------------- |
| overrides 嵌套失效 (L-018) | 1 次     | ❌ npm 通用知识       |
| 可观测性分阶段接入 (L-019) | 1 次     | ❌ 架构模式，非 skill |
| 漏洞分级策略 (L-020)       | 1 次     | ❌ 运营策略，非 skill |

**结论**: 本次无 skillify 候选。
