# 一键复刻功能 Spec

## Why

当前项目有两条独立的管道：对标解析（Benchmark）产出结构化报告，视频生成（Generation）产出视频。但二者之间没有串联链路 — 用户必须手动抄写报告内容到生成工作台。PRD 设计的"粘贴链接 → 自动拆解 → 一键复刻 → 生成新视频"闭环完全缺失。

本 Spec 补全这条闭环：用户在对标解析详情页点击"一键复刻"，系统基于结构化报告自动构建视频生成参数，跳转到生成工作台预填，用户可调整后提交。

## What Changes

### 后端

- **新增** `POST /api/v1/benchmarks/:id/clone` 端点 — 基于结构化报告生成视频提示词和推荐参数
- **新增** `ClonePromptService`（libs/ai）— 将 `StructuredReport` 转化为视频生成 prompt
- **修改** `CreateGenerationDto` — 新增 `benchmarkId` 可选字段
- **修改** `generation.service.ts` — 创建 Work 时关联 `benchmarkId`，构建 `VideoGenParams` 时传入

### 前端

- **新增** 对标解析详情页 `pages/benchmark/detail/index.tsx`（主包）
- **修改** `pages/benchmark/index.tsx` — 取消注释详情页跳转，历史记录点击跳转详情页
- **修改** 生成工作台页面 — 接收 URL 参数预填 prompt 和 benchmarkId
- **修改** `app.config.ts` — 主包 pages 新增 benchmark/detail

## Impact

- Affected specs: `build-reelclone-mvp`（Task 13 benchmark-service + Task 23 workbench 分包）
- Affected code:
  - `apps/benchmark-service/src/benchmark/benchmark.controller.ts` — 新增 clone 端点
  - `apps/benchmark-service/src/benchmark/benchmark.service.ts` — 新增 clone 逻辑
  - `apps/workbench-service/src/workbench/dto/create-generation.dto.ts` — 新增 benchmarkId
  - `apps/workbench-service/src/workbench/generation.service.ts` — 关联 benchmarkId
  - `libs/ai/src/llm/prompt-engine.service.ts` — 新增 generateClonePrompt 方法
  - `apps/miniprogram/src/pages/benchmark/index.tsx` — 启用详情页跳转
  - `apps/miniprogram/src/pages/benchmark/detail/index.tsx` — 新建
  - `apps/miniprogram/src/pages/workbench/video-text/index.tsx` — 接收预填参数
  - `apps/miniprogram/src/app.config.ts` — 注册详情页路由

## ADDED Requirements

### Requirement: 一键复刻参数生成

系统 SHALL 提供基于对标解析结果自动构建视频生成参数的能力。

#### Scenario: 用户点击一键复刻

- **WHEN** 用户在对标解析详情页点击"一键复刻"按钮
- **AND** 该对标解析状态为 COMPLETED
- **THEN** 系统调用 `POST /api/v1/benchmarks/:id/clone`
- **AND** 后端读取 `StructuredReport`（style/shotList/copywriting/sellingPoints）
- **AND** 使用 LLM 将报告转化为视频生成 prompt（80-200 字）
- **AND** 返回推荐参数（模型/分辨率/宽高比/时长）
- **AND** 前端跳转到文生视频工作台并预填 prompt
- **AND** 用户可在工作台调整参数后提交

#### Scenario: 对标解析未完成时点击复刻

- **WHEN** 用户尝试对未完成（PENDING/ANALYZING）的对标解析进行复刻
- **THEN** 系统返回 400 错误
- **AND** 提示"解析尚未完成"

#### Scenario: 复刻生成的作品溯源

- **WHEN** 用户通过一键复刻提交视频生成任务
- **THEN** Work 记录的 `benchmarkId` 字段关联到对应的 Benchmark 记录
- **AND** VideoGenParams 中传入 `benchmarkId`
- **AND** 可通过 benchmarkId 查询所有基于该对标解析创建的作品

### Requirement: 对标解析详情页

系统 SHALL 提供对标解析详情页展示结构化报告。

#### Scenario: 用户查看解析详情

- **WHEN** 用户在解析历史列表中点击一条已完成记录
- **THEN** 跳转到详情页 `/pages/benchmark/detail/index?id={benchmarkId}`
- **AND** 页面展示视频整体风格、节奏分析
- **AND** 页面展示镜头脚本列表（场景序号/时长/画面描述/口播文案/画面文字）
- **AND** 页面展示文案拆解（hook/body/cta）
- **AND** 页面展示卖点提炼
- **AND** 页面底部显示"一键复刻"按钮

#### Scenario: 用户查看未完成解析

- **WHEN** 用户点击一条未完成的解析记录
- **THEN** 跳转到详情页显示加载状态
- **AND** WebSocket 推送完成后自动刷新详情

## MODIFIED Requirements

### Requirement: 生成任务提交

原有 `POST /api/v1/generations` 接口新增 `benchmarkId` 可选字段。

#### Scenario: 携带 benchmarkId 提交生成

- **WHEN** 客户端提交生成任务时携带 `benchmarkId`
- **THEN** 系统创建 Work 记录时关联该 benchmarkId
- **AND** VideoGenParams 中传入 benchmarkId 用于溯源

#### Scenario: 不携带 benchmarkId 提交生成（兼容）

- **WHEN** 客户端提交生成任务时不携带 `benchmarkId`
- **THEN** 行为与原有逻辑完全一致
- **AND** Work 记录的 benchmarkId 为 null
