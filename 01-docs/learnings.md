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
