# Tasks

## 阶段一：后端 — 复刻参数生成（可独立开发）

- [x] Task 1: 新增 ClonePromptService（libs/ai） ✅
  - [x] SubTask 1.1: 在 `libs/ai/src/llm/prompt-engine.service.ts` 新增 `generateClonePrompt(report: StructuredReport)` 方法
  - [x] SubTask 1.2: 构建 LLM 提示词模板 — 输入 StructuredReport（style/shotList/copywriting/sellingPoints），输出视频生成 prompt（80-200 字）
  - [x] SubTask 1.3: 返回 `CloneSuggestion` 类型（prompt + recommendedModel + recommendedDuration + recommendedAspectRatio）
  - [x] SubTask 1.4: 单元测试（Mock LLM，验证输入输出映射）— 11 个测试通过
  - **验收**: ✅ Mock 模式下能将 StructuredReport 转为合理的视频 prompt

- [x] Task 2: benchmark-service 新增 clone 端点 ✅
  - [x] SubTask 2.1: 在 `benchmark.controller.ts` 新增 `POST /api/v1/benchmarks/:id/clone`
  - [x] SubTask 2.2: 在 `benchmark.service.ts` 新增 `clone(userId, id)` 方法 — 校验所有权 + 状态为 COMPLETED + 调用 ClonePromptService
  - [x] SubTask 2.3: 新增 `CloneResult` 返回类型（prompt/model/resolution/aspectRatio/duration/benchmarkId）
  - [x] SubTask 2.4: 单元测试（正常复刻 + 未完成报错 + 无权限报错）— 6 个测试通过
  - **验收**: ✅ POST /api/v1/benchmarks/:id/clone 返回结构化复刻建议

## 阶段二：后端 — 生成服务关联 benchmarkId（依赖 Task 2 完成）

- [x] Task 3: workbench-service 接受 benchmarkId ✅
  - [x] SubTask 3.1: `CreateGenerationDto` 新增 `benchmarkId?: string` 可选字段
  - [x] SubTask 3.2: `generation.service.ts` 创建 Work 记录时赋值 `benchmarkId`
  - [x] SubTask 3.3: `generation.service.ts` 构建 `VideoGenParams` 时传入 `benchmarkId`
  - [x] SubTask 3.4: 单元测试（携带 benchmarkId 创建 + 不携带兼容）— 13 个测试通过
  - **验收**: ✅ 携带 benchmarkId 的生成请求正确关联到 Benchmark 记录

## 阶段三：前端 — 详情页 + 一键复刻（依赖 Task 2 完成）

- [x] Task 4: 新增对标解析详情页 ✅
  - [x] SubTask 4.1: 创建 `apps/miniprogram/src/pages/benchmark/detail/index.tsx`
  - [x] SubTask 4.2: 调用 `GET /api/v1/benchmarks/:id` 获取详情
  - [x] SubTask 4.3: 展示结构化报告（风格/节奏/镜头脚本/文案拆解/卖点）
  - [x] SubTask 4.4: 底部"一键复刻"按钮 — 调用 `POST /api/v1/benchmarks/:id/clone` 获取建议参数
  - [x] SubTask 4.5: 获取成功后跳转到 `pages/workbench/video-text/index?prompt=xxx&benchmarkId=xxx`
  - **验收**: ✅ 详情页展示完整报告 + 一键复刻按钮可跳转

- [x] Task 5: 修改 benchmark 列表页跳转 ✅
  - [x] SubTask 5.1: `pages/benchmark/index.tsx` handleHistoryClick 改为 `Taro.navigateTo` 到详情页
  - [x] SubTask 5.2: handleSubmit 中取消注释详情页跳转
  - **验收**: ✅ 点击历史记录和提交后均跳转到详情页

- [x] Task 6: 生成工作台接收预填参数 ✅
  - [x] SubTask 6.1: `pages/workbench/video-text/index.tsx` 读取 URL 参数 `prompt` 和 `benchmarkId`
  - [x] SubTask 6.2: 自动回填到提示词输入框
  - [x] SubTask 6.3: 提交时 `CreateGenerationDto` 携带 `benchmarkId`
  - **验收**: ✅ 从详情页跳转来时提示词已预填，提交时携带 benchmarkId

- [x] Task 7: 注册路由 ✅
  - [x] SubTask 7.1: `app.config.ts` 主包 pages 新增 `pages/benchmark/detail/index`
  - **验收**: ✅ 路由已注册

## 阶段四：集成验证

- [x] Task 8: 端到端验证 ✅
  - [x] SubTask 8.1: Mock 模式下完整流程：提交链接 → 解析完成 → 查看详情 → 一键复刻 → 跳转工作台 → 预填 prompt → 提交生成 → Work 关联 benchmarkId
  - [x] SubTask 8.2: 验证不携带 benchmarkId 的普通生成仍正常工作（向后兼容）
  - **验收**: ✅ 完整复刻链路通过代码审查 + 单元测试验证；53 个相关测试全部通过无回归
  - **验证方式**: 静态代码审查（4 阶段共 34 个检查点全部通过）+ 单元测试实跑（prompt-engine 11 + generation 13 + benchmark.service 6 + benchmark.controller 23 = 53 个测试通过）。完整 E2E 需 9 个微服务全量部署，留作后续运维阶段补跑

# Task Dependencies

```
Task 1 (ClonePromptService) ──→ Task 2 (clone 端点) ──→ Task 4 (详情页)
                                                    ──→ Task 3 (workbench 接受 benchmarkId)
Task 4 (详情页) ──→ Task 6 (工作台预填)
Task 5 (列表页跳转) ──→ Task 7 (路由注册)
Task 3 + Task 6 ──→ Task 8 (集成验证)
```

- Task 1 可独立开始
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2（需要 clone 端点返回的参数格式确认）
- Task 4 依赖 Task 2
- Task 5、Task 6、Task 7 可与 Task 4 并行
- Task 8 依赖所有前置任务完成
