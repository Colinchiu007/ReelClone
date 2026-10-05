# Capability Registry 评审修复计划

> 基于评审结论，修复 P0×3 + P1×5 + P2×1 共 9 个问题。

## 摘要

Capability Registry 方向正确，但存在 3 个架构级问题（多实例不一致、静默降级、类型无关联）和多个设计优化点。本计划按依赖顺序分 4 步修复，确保资金安全和类型正确性。

---

## Step 1: 启动校验 + 严格查询（P0-2 + P1-4 + P1-8）

**目标**：消灭静默降级，增加配置自检，防止积分少收。

### 1.1 `libs/capability/src/capability.registry.ts` — 3 处修改

**修改 A**：构造函数增加校验

```typescript
constructor(configs: CapabilityConfig[], options?: { strict?: boolean }) {
  this.strict = options?.strict ?? false
  this.capabilities = new Map()
  for (const config of configs) {
    this.capabilities.set(config.type, config)
  }
  // 启动校验（P1-8）
  this.validate()
}
```

**修改 B**：新增 `validate()` 私有方法

校验所有 `GenerationType` 枚举值是否都有配置；matrix 模式的 `base` keys 与 `ui.resolutions` 一致；`multiplier` keys 与 `ui.durations` 一致。任一不通过抛出 `Error`（注册阶段 fail-fast）。

**修改 C**：`calculatePoints()` — matrix 模式下未知 duration 拒绝

```typescript
// 改前: const mult = config.multiplier[duration] ?? 1
// 改后:
if (!(duration in config.multiplier)) {
  throw new Error(
    `类型 ${type} 不支持时长 ${duration} 秒，允许值: [${Object.keys(config.multiplier).join(', ')}]`,
  )
}
const mult = config.multiplier[duration]
```

同样处理未知 resolution。

**修改 D**：新增 `getOrThrow(type)` 方法

```typescript
getOrThrow(type: GenerationType): CapabilityConfig {
  const cap = this.capabilities.get(type)
  if (!cap) throw new Error(`未注册的生成类型: ${type}`)
  return cap
}
```

**修改 E**：`getProvider()` / `getWorkType()` / `getTemporalWorkType()` — strict 模式下未知类型抛异常

```typescript
getProvider(type: GenerationType): string {
  const cap = this.capabilities.get(type)
  if (!cap) {
    if (this.strict) throw new Error(`未注册的生成类型: ${type}`)
    return 'MOCK'
  }
  return cap.provider
}
```

`WorkTypeName` 返回类型从 `string` 收窄为联合字面量类型。

### 1.2 `libs/capability/src/capability.registry.spec.ts` — 新增测试

- validate() 校验通过（正常种子数据）
- validate() 缺少类型时抛错（手动构造不完整数组）
- validate() matrix base keys 与 resolutions 不一致时抛错
- calculatePoints() 未知 duration 抛异常
- calculatePoints() 未知 resolution 抛异常
- strict 模式 getProvider() 未知类型抛异常
- getOrThrow() 未知类型抛异常

### 1.3 `libs/capability/src/index.ts` — 新增导出

导出 `validateCapabilities` 函数（供外部独立调用）。

---

## Step 2: 统一后端单实例（P0-1 + P1-7）

**目标**：后端所有消费者通过 NestJS DI 获取同一个 CapabilityRegistry 实例。

### 2.1 `apps/workbench-service/src/workbench/workbench.module.ts`

新增 `CapabilityModule` 到 imports：

```typescript
import { CapabilityModule } from '@reelclone/capability'

@Module({
  imports: [
    TypeOrmModule.forFeature([Work, GenerationTask], DATABASE_CONNECTIONS.MAIN),
    CapabilityModule,  // 新增
  ],
  ...
})
```

### 2.2 `apps/workbench-service/src/workbench/points-calculator.util.ts` — 重写

删除本地 `new CapabilityRegistry()` 实例。改为导出接受 registry 参数的函数：

```typescript
import { CapabilityRegistry, GenerationType } from '@reelclone/capability'

export function calculatePoints(
  registry: CapabilityRegistry,
  type: GenerationType,
  options?: { resolution?: string; duration?: number },
): number {
  return registry.calculatePoints(type, options)
}

export function isVideoType(registry: CapabilityRegistry, type: GenerationType): boolean {
  return registry.isVideoType(type)
}
```

删除 `PROMPT_POINTS` 常量（提示词反推/润色不在 registry 范围，移到使用处）。
删除 `VideoResolution` / `VideoDuration` 类型（直接使用 `string` / `number`，由 registry 校验）。

### 2.3 `apps/workbench-service/src/workbench/generation/shared.ts` — 3 处修改

**修改 A**：删除本地 `new CapabilityRegistry()` 实例（第 72 行）和 `TEMPORAL_WORK_TYPE_MAP`（第 75-77 行）

**修改 B**：`mapToWorkType()` 和 `mapToProvider()` 接受 registry 参数：

```typescript
export function mapToWorkType(registry: CapabilityRegistry, type: GenerationType): string {
  return registry.getWorkType(type)
}

export function mapToProvider(
  registry: CapabilityRegistry,
  type: GenerationType,
): GenerationProvider {
  const provider = registry.getProvider(type)
  if (provider === 'SEEDANCE') return GenerationProvider.SEEDANCE
  return GenerationProvider.MOCK
}
```

**修改 C**：删除 `import { CapabilityRegistry, DEFAULT_CAPABILITIES } from '@reelclone/capability'`，改为 `import { CapabilityRegistry, GenerationType } from '@reelclone/capability'`

### 2.4 `apps/workbench-service/src/workbench/generation/create.handler.ts` — 注入 registry

```typescript
import { Inject } from '@nestjs/common'
import { CapabilityRegistry, CAPABILITY_REGISTRY, GenerationType } from '@reelclone/capability'

export class GenerationCreateHandler {
  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN) private readonly dataSource: DataSource,
    private readonly billingClient: BillingClient,
    private readonly templateClient: TemplateClient,
    private readonly temporalService: TemporalService,
    private readonly configService: ConfigService,
    @Inject(CAPABILITY_REGISTRY) private readonly registry: CapabilityRegistry, // 新增
  ) {}
```

所有 `calculatePoints(type, ...)` 改为 `calculatePoints(this.registry, type, ...)`。
所有 `isVideoType(type)` 改为 `isVideoType(this.registry, type)`。
所有 `mapToWorkType(type)` 改为 `mapToWorkType(this.registry, type)`。
所有 `mapToProvider(type)` 改为 `mapToProvider(this.registry, type)`。
第 391 行 `TEMPORAL_WORK_TYPE_MAP[dto.generationType]` 改为 `this.registry.getTemporalWorkType(dto.generationType)`。
删除 `TEMPORAL_WORK_TYPE_MAP` 导入（从 shared 导入列表中移除）。

### 2.5 `apps/workbench-service/src/workbench/generation/retry.handler.ts` — 同理注入

检查 retry.handler.ts 是否需要注入 registry（它从 `points-calculator.util` 导入 `isVideoType`）。

### 2.6 移除 `PROMPT_POINTS` 的处理

检查 `PROMPT_POINTS` 在代码库中的使用位置，移到实际使用处（可能是 workbench-service 中的某个 handler）。

---

## Step 3: 类型对齐 + 语义修正（P0-3 + P1-6 + P1-5）

**目标**：消除字符串字面量与 Temporal WorkType 枚举的无关联风险，修正 MOCK 类型语义，减少校验重复。

### 3.1 `libs/capability/src/capability.types.ts` — 2 处修改

**修改 A**：`TemporalWorkTypeName` 改为从 temporal WorkType 枚举派生（不引入运行时依赖）：

```typescript
// 改前：硬编码字符串字面量
export type TemporalWorkTypeName =
  | 'text_to_video' | 'image_to_video' | ...

// 改后：使用 temporal WorkType 枚举的值类型
// 需要 import type { WorkType } from '@reelclone/temporal/contracts'
import type { WorkType as TemporalWorkType } from '@reelclone/temporal/contracts'
export type TemporalWorkTypeName = TemporalWorkType
```

注意：`import type` 是零运行时开销的纯类型导入，不会引入循环依赖。但需要确认 `libs/capability/tsconfig.json` 能解析 `@reelclone/temporal` 路径。如果不能，备选方案是在 CapabilityRegistry 构造时做运行时校验（见 3.2）。

**修改 B**：`WorkTypeName` 收窄类型：

```typescript
// 改前：export type WorkTypeName = 'TEXT' | 'IMAGE' | 'VIDEO'
// 保持不变（已是联合字面量）
```

### 3.2 `libs/capability/src/capability.registry.ts` — 构造时运行时校验

如果 3.1 的 `import type` 因路径解析不可行，则在 `validate()` 中加入运行时校验：

```typescript
private validate(): void {
  const temporalWorkTypeValues = new Set([
    'text_to_video', 'image_to_video', 'image_to_video_with_tail',
    'edit_video', 'extend_video', 'reference_to_video',
  ])
  for (const config of this.capabilities.values()) {
    if (!temporalWorkTypeValues.has(config.temporalWorkType)) {
      throw new Error(`temporalWorkType "${config.temporalWorkType}" 不在 Temporal WorkType 枚举中`)
    }
  }
}
```

### 3.3 `libs/capability/src/capability.default.ts` — MOCK 类型注释

在 `TEXT_GENERATE` 和 `IMAGE_GENERATE` 的 `temporalWorkType` 行添加注释：

```typescript
// MOCK Provider — temporalWorkType 仅为兼容映射，实际不启动 Temporal 工作流
temporalWorkType: 'text_to_video',
```

### 3.4 `apps/workbench-service/src/workbench/dto/create-generation.dto.ts` — 校验分层注释

在 DTO 顶部添加注释说明分层语义：

```typescript
/**
 * HTTP 层校验（格式、长度、枚举范围）。
 * 业务层校验（必需参数、Provider 兼容性）由 CapabilityRegistry.validateParams() 处理。
 * 修改校验规则时需同步更新 @reelclone/capability 中的 paramRules。
 */
```

---

## Step 4: 前端优化 + 报告更新（P2-10 + 报告）

**目标**：减少前端包体积，更新重构报告。

### 4.1 `apps/miniprogram/src/utils/capabilities.ts` — 导出预计算查找表

```typescript
/** 预计算所有视频类型的积分表（避免重复计算） */
export const VIDEO_POINTS_TABLES: Record<string, Record<string, number>> = {}
for (const type of Object.values(GenerationType)) {
  const table = registry.getPointsTable(type as GenerationType)
  if (Object.keys(table).length > 0) {
    VIDEO_POINTS_TABLES[type] = table
  }
}
```

页面可直接使用 `VIDEO_POINTS_TABLES.TEXT_TO_VIDEO` 而非每次调用 `getPointsTable()`。

注释说明：前端为静态单例，不支持运行时价格热更新（如需热更新需后端 `/capabilities` API）。

### 4.2 `01-docs/13-项目深度重构分析报告.md` — 更新 P1-3 章节

在 P1-3 修复记录中追加评审修复信息。

---

## 修改文件清单

| 文件                                                                | 操作 | 步骤   |
| ------------------------------------------------------------------- | ---- | ------ |
| `libs/capability/src/capability.registry.ts`                        | 编辑 | Step 1 |
| `libs/capability/src/capability.registry.spec.ts`                   | 编辑 | Step 1 |
| `libs/capability/src/index.ts`                                      | 编辑 | Step 1 |
| `libs/capability/src/capability.types.ts`                           | 编辑 | Step 3 |
| `libs/capability/src/capability.default.ts`                         | 编辑 | Step 3 |
| `apps/workbench-service/src/workbench/workbench.module.ts`          | 编辑 | Step 2 |
| `apps/workbench-service/src/workbench/points-calculator.util.ts`    | 重写 | Step 2 |
| `apps/workbench-service/src/workbench/generation/shared.ts`         | 编辑 | Step 2 |
| `apps/workbench-service/src/workbench/generation/create.handler.ts` | 编辑 | Step 2 |
| `apps/workbench-service/src/workbench/generation/retry.handler.ts`  | 编辑 | Step 2 |
| `apps/workbench-service/src/workbench/dto/create-generation.dto.ts` | 编辑 | Step 3 |
| `apps/miniprogram/src/utils/capabilities.ts`                        | 编辑 | Step 4 |
| `01-docs/13-项目深度重构分析报告.md`                                | 编辑 | Step 4 |

## 验证步骤

每个 Step 完成后运行：

```powershell
# Step 1 后：capability 包单元测试
npx nx test capability --passWithNoTests

# Step 2 后：workbench-service 单元测试
npx nx test workbench-service --passWithNoTests

# Step 3 后：capability 包单元测试（类型变更）
npx nx test capability --passWithNoTests

# Step 4 后：全量 typecheck
npx nx run-many -t typecheck --all
```

## 决策记录

- **Q: CapabilityRegistry 构造时是否传入 strict 参数？**
  A: 是。默认 `strict: true`，测试中可设为 false 以测试 fallback 行为。

- **Q: `import type { WorkType } from '@reelclone/temporal/contracts'` 在 capability 包中是否可行？**
  A: 优先尝试。如果 tsconfig 解析失败，降级为 3.2 运行时校验方案。

- **Q: `PROMPT_POINTS`（提示词反推/润色）是否纳入 registry？**
  A: 不纳入。这两个操作不在 `GenerationType` 枚举范围内，保持独立常量。

- **Q: 前端是否需要注入 registry？**
  A: 不需要。前端为静态配置消费，保持 import 直接实例化。
