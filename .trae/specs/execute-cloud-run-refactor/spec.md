# 微信云托管版深度重构 Spec

## Why

基于全量代码库深度分析（4 维度：后端/前端/测试/架构），识别出 32 个重构项。部署目标为微信云托管（WeChat Cloud Run），需在现有代码基础上消除安全语义不一致、代码重复、分层违规、配置硬编码等问题，同时适配云托管部署模式（镜像瘦身、Temporal 独立部署）。

## What Changes

### P0 — 安全/正确性（4 项）

- 统一 user-service JWT 策略到 `AuthStrategyModule.forRoot()`，增加 `userStatusCheck` 可选配置
- 删除 auth-service 死代码 `jwt.strategy.ts`（94 行未引用）
- 修复 2 处分层违规（profit-sharing-record.controller.ts + industry.controller.ts）
- **BREAKING**: 移除所有 `localhost` fallback，改为 `ConfigService.getOrThrow()`（云托管中 localhost 绝对不工作）

### P1 — 可维护性（10 项）

- 拆分 `OrderService.handleCallback()` 270 行方法为 5-6 个私有方法
- 统一 5+ 个 `billing.client.ts` 到 `InternalHttpClient`（含熔断器+重试）
- 抽取 `bootstrapService()` 工厂函数统一 11 个 `main.ts`
- E2E 测试纳入 CI（docker-compose 启动依赖 + 运行 test:e2e）
- 补全 database 库单元测试（14 个 TypeORM 实体）
- 统一 Dockerfile 模板（移除 HEALTHCHECK，云托管接管）
- 统一 `.env.example`（配置入口改为云托管控制台）
- 修复失效的 `test:integration` 脚本
- **新增**: Docker 镜像瘦身优化（npm prune + .dockerignore）
- **新增**: Temporal 部署方案调研与文档输出

### P2 — 一致性（9 项）

- auth-service 异常类型统一为 `BusinessException`
- AllExceptionsFilter 注册方式统一为 `APP_FILTER`
- `process.env` 直接访问改用 `ConfigService.get()`
- 文件命名统一为 `billing.client.ts`
- `console.log` 改用 `Logger`
- 更新 `CURRENT_ARCHITECTURE.md`（common→database 已修复 + 部署目标）
- `template.client.ts` 改用 `InternalHttpClient`
- admin-web 补充关键页面测试
- oss 库补充单元测试

### P3 — 锦上添花（9 项，按需执行）

- 删除 8 个 deprecated `jwt.strategy.ts` 薄封装
- 小程序抽取基础 Modal 组件
- 小程序 taroStorage 提取到 `stores/storage.ts`
- admin-web 抽取 `<ListPage>` 通用组件
- 手写类型迁移到 generated 类型
- 清理 libs/database/src 编译产物
- tsconfig 启用 `allowImportingTsExtensions`
- 消除生产代码 9 处 `any`
- 条件编译规范化 + H5 配置预置

## Impact

- **Affected specs**: [build-reelclone-mvp](../build-reelclone-mvp/spec.md), [execute-deep-refactor](../execute-deep-refactor/tasks.md)
- **Affected code**:
  - 后端 11 个微服务的 `main.ts` / `app.module.ts` / `jwt.strategy.ts` / `billing.client.ts`
  - 共享库 `libs/common/src/auth/access-token.strategy.ts`
  - 共享库 `libs/http-client/`（InternalHttpClient 扩展）
  - 共享库 `libs/database/`（新增测试）
  - 共享库 `libs/oss/`（新增测试）
  - CI 配置 `.github/workflows/ci.yml`
  - Docker 配置 `apps/*/Dockerfile`
  - 前端 `apps/miniprogram/`（P3 条件编译）
  - 前端 `apps/admin-web/`（P2 测试补充）
  - 文档 `CURRENT_ARCHITECTURE.md`

## ADDED Requirements

### Requirement: 统一 JWT 安全策略

所有 HTTP 服务 SHALL 使用 `AuthStrategyModule.forRoot()` 统一 JWT 策略，支持可选 `userStatusCheck` 配置。

#### Scenario: user-service 迁移后安全校验完整

- **WHEN** user-service 使用 `AuthStrategyModule.forRoot({ userStatusCheck: true })`
- **THEN** JWT 校验包含 token type、jti 黑名单、密码修改踢下线、tokenVersion、session family、用户状态（FROZEN/DELETED）6 项

### Requirement: 移除硬编码 localhost fallback

所有服务间调用 SHALL 使用 `ConfigService.getOrThrow()` 获取目标服务 URL，不得有 localhost fallback。

#### Scenario: 缺少 BILLING_SERVICE_URL 环境变量

- **WHEN** 服务启动时缺少 `BILLING_SERVICE_URL` 环境变量
- **THEN** 服务启动失败并抛出明确错误

### Requirement: 统一 Dockerfile 模板

所有 11 个服务的 Dockerfile SHALL 使用统一模板（Node 20-alpine + 多阶段构建 + 无 HEALTHCHECK）。

#### Scenario: Docker 构建成功

- **WHEN** 执行 `docker build` 构建任意服务
- **THEN** 构建成功，镜像体积 < 400MB

### Requirement: 镜像瘦身优化

Docker prod stage SHALL 仅包含 production 依赖（`npm prune --production --legacy-peer-deps`）。

#### Scenario: 镜像体积减小

- **WHEN** 镜像构建完成
- **THEN** 镜像体积从 ~800MB 降至 ~300MB

## MODIFIED Requirements

### Requirement: bootstrapService 工厂函数

11 个服务的 `main.ts` SHALL 使用 `@reelclone/common` 的 `bootstrapService()` 工厂函数，统一为 3-5 行调用。

### Requirement: billing.client 统一

所有服务的 billing.client.ts SHALL 使用 `@reelclone/http-client` 的 `InternalHttpClient`，不得使用 axios 直接调用。

### Requirement: E2E CI 集成

CI SHALL 在 Docker 构建后运行 E2E 测试（docker-compose 启动依赖 + `npm run test:e2e`）。

## REMOVED Requirements

### Requirement: docker-compose.prod.yml 现场 build

**Reason**: 微信云托管管理容器编排，不需要 docker-compose.prod.yml
**Migration**: 删除 `build:` 配置，改为云托管控制台上传镜像

### Requirement: Nginx 反向代理

**Reason**: 微信云托管自带 API 网关
**Migration**: 删除 `docker/nginx/` 配置
