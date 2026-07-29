# Run E2E Validation Spec

## Why

ReelClone 项目已完成 MVP 功能开发（9 个微服务 + admin-service + admin-web + miniprogram）、494 个单元测试全部通过、typecheck + lint 通过。但完整的端到端（E2E）测试尚未实际跑通——既有的 5 个 flow 测试 + 5 个 API 测试需要 9 个微服务全量部署才能运行，运营后台 81 个检查点目前仅通过单元测试 + 代码审查验证，未做真实部署联调。同时，用户最关心的"一键复刻"链路（抖音链接 → 对标解析 → 复刻 → 视频生成）只在 Mock 模式下验证过，未用真实抖音链接跑通。本 spec 目标是补齐这块短板，验证系统在真实部署下能否跑通核心业务路径，并明确回答"是否需要视频模型 API Key"以及"系统是否支持 API Key 配置"。

## What Changes

- **部署基础设施**：启动 PostgreSQL + Redis + Temporal 容器，执行 4 个数据库的迁移
- **部署 9 个微服务 + admin-service**：本地启动所有服务，验证 /health 端点
- **创建管理员账号**：通过迁移脚本或 SQL 插入 bcrypt 哈希密码的管理员账号
- **运行已有 E2E 测试**：5 个 flow 测试（登录→生成、上传→生成→下载、对标解析→生成、购买→消费、形象组→生成）+ 5 个 API 测试
- **运营后台 E2E 关键流程验证**：管理员登录 → Dashboard → 用户管理 → 审核工作台 → 套餐管理 → 订单管理 → API Key 管理
- **实际抖音链接复刻链路验证**：找一个真实抖音视频链接，提交对标解析 → 等待解析完成 → 一键复刻 → 视频生成（Mock 模式 + 可选真实模式）
- **API Key 配置支持验证**：验证环境变量配置 + 数据库动态配置 + admin-web 热刷新三种方式
- **文档与记忆更新**：记录 E2E 测试结果、问题清单、API Key 配置说明，更新 project_memory

## Impact

- Affected specs:
  - `build-reelclone-mvp`（MVP 交付，E2E 验证为其收尾）
  - `implement-video-clone`（一键复刻功能，E2E 验证其端到端可用性）
  - `build-admin-dashboard`（运营后台，E2E 验证其真实部署可用性）
- Affected code: 无新增代码，纯验证 + 文档
- Affected docs: `project_memory.md`（追加 E2E 验证结论）、可能新增 `01-docs/05-E2E验证报告.md`

## ADDED Requirements

### Requirement: 完整 E2E 测试执行

系统 SHALL 在本地真实部署（Docker 容器 + NestJS 进程）下跑通既有 10 个 E2E 测试用例（5 flows + 5 APIs），并记录通过/失败结果。

#### Scenario: 基础设施就绪

- **WHEN** 执行 `docker compose up -d` 启动 PostgreSQL + Redis + Temporal
- **AND** 执行 `npm run migration:run` 完成所有数据库迁移
- **THEN** 4 个数据库（main/billing/template/benchmark）+ temporal 库均可连接
- **AND** 所有表结构创建成功

#### Scenario: 9 个微服务全部启动

- **WHEN** 启动 auth/user/asset/workbench/benchmark/billing/template/notification/gateway 服务
- **AND** 启动 admin-service
- **THEN** 所有服务的 `/health` 端点返回 200
- **AND** 服务间可通过 HTTP/TCP 正常通信

#### Scenario: 既有 E2E 测试全部跑通

- **WHEN** 执行 `npm run test:e2e` 运行 10 个 E2E 测试用例
- **THEN** 记录每个用例的通过/失败状态
- **AND** 失败用例需附根因分析和修复建议

### Requirement: 运营后台 E2E 关键流程验证

系统 SHALL 验证运营后台 6 个关键端到端流程在真实部署下可用。

#### Scenario: 管理员登录并访问 Dashboard

- **WHEN** 管理员通过 `POST /api/v1/auth/admin-login` 登录（mobile + password）
- **AND** 携带 JWT 调用 `GET /admin/stats/overview`
- **THEN** 返回 DAU/新增/GMV/生成量等指标数据
- **AND** 普通用户 JWT 调用该端点返回 403

#### Scenario: 用户管理 - 封禁用户踢下线

- **WHEN** 管理员调用 `PUT /admin/users/:id/status` 封禁用户
- **THEN** 用户 status 变为 FROZEN
- **AND** Redis 写入 `user:password-changed:{userId}` 黑名单 key
- **AND** 被封禁用户的后续请求被 JwtStrategy 拒绝（401）

#### Scenario: 审核工作台 - 模板审核

- **WHEN** 管理员调用 `POST /admin/templates/:id/review` 审核模板
- **THEN** 模板状态从 PENDING_REVIEW 变为 ACTIVE/REJECTED
- **AND** 通知服务推送审核结果给提交者

#### Scenario: API Key 热刷新

- **WHEN** 管理员调用 `PUT /admin/config/api-keys` 更新 Seedance API Key
- **THEN** system_config 表更新
- **AND** Redis Pub/Sub 发布 `config:updated` 消息
- **AND** SeedanceProvider 收到通知后 reloadKeys，新 Key 立即生效

### Requirement: 实际抖音链接复刻链路验证

系统 SHALL 使用真实抖音视频链接验证完整复刻链路。

#### Scenario: Mock 模式跑通（无真实 API Key）

- **GIVEN** 未配置 SEEDANCE_API_KEYS 和 LLM_API_KEY
- **WHEN** 提交一个真实抖音视频链接到 `POST /api/v1/benchmarks`
- **THEN** 视频下载器真实下载该抖音视频
- **AND** 分析器以 Mock 模式生成结构化报告
- **AND** 一键复刻生成 Mock 视频
- **AND** 整个链路无异常，可看到作品记录

#### Scenario: 真实模式跑通（可选，需 API Key）

- **GIVEN** 配置了有效的 SEEDANCE_API_KEYS 和 LLM_API_KEY
- **WHEN** 提交真实抖音链接 → 对标解析 → 一键复刻
- **THEN** LLM 真实生成结构化分析报告
- **AND** Seedance 真实提交视频生成任务
- **AND** 轮询直到生成完成
- **AND** 可下载生成的视频文件

### Requirement: API Key 配置支持验证

系统 SHALL 明确回答"是否需要视频模型 API Key"以及"如何配置"。

#### Scenario: 三种配置方式验证

- **WHEN** 验证环境变量方式（`SEEDANCE_API_KEYS=key1,key2`）
- **AND** 验证数据库方式（通过 admin-web 或 `PUT /admin/config/api-keys`）
- **AND** 验证热刷新（更新后无需重启服务）
- **THEN** 三种方式均生效，且数据库配置优先级高于环境变量

#### Scenario: Mock 模式降级

- **WHEN** 未配置任何 API Key
- **THEN** SeedanceProvider 进入 Mock 模式，返回模拟数据
- **AND** 日志输出 "Seedance 处于 Mock 模式" 警告
- **AND** 业务流程不中断（适合开发联调）

## MODIFIED Requirements

### Requirement: 项目记忆更新

E2E 验证完成后，SHALL 更新 `project_memory.md` 追加以下内容：

- E2E 测试执行结果（通过/失败数）
- 实际抖音链接复刻验证结论
- API Key 配置方式说明
- 发现的问题和后续待办

## REMOVED Requirements

无移除项。
