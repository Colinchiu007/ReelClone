# Tasks — 微信云托管版深度重构

> 基于 [18-深度重构方案-微信云托管版.md](../../../01-docs/18-深度重构方案-微信云托管版.md)

## Phase 1: P0 安全/正确性修复

- [x] Task 1: 统一 user-service JWT 策略 ✅ `04546ed`
  - [x] 1.1: 在 `libs/common/src/auth/access-token.strategy.ts` 增加 `userStatusCheck` 可选配置（检查用户 FROZEN/DELETED 状态）
  - [x] 1.2: user-service `user.module.ts` 迁移到 `AuthStrategyModule.forRoot({ userStatusCheck: true })`
  - [x] 1.3: 删除 `apps/user-service/src/auth/jwt.strategy.ts`（112 行独立实现）
  - [x] 1.4: 更新 user-service 相关测试，验证 6 项安全校验全部生效
  - [x] 1.5: typecheck + unit test + E2E auth flow 验证

- [x] Task 2: 删除 auth-service 死代码 ✅ `6cc3ea9`
  - [x] 2.1: 删除 `apps/auth-service/src/auth/jwt.strategy.ts`（94 行未引用）
  - [x] 2.2: typecheck 验证无断裂

- [x] Task 3: 修复 2 处分层违规 ✅ `4d5c2dc`
  - [x] 3.1: `profit-sharing-record.controller.ts` — 将 Repository 查询移到 `ProfitSharingService`
  - [x] 3.2: `industry.controller.ts` — 创建 `IndustryService` 封装 User 表读写
  - [x] 3.3: 更新相关测试
  - [x] 3.4: typecheck + unit test 验证

- [x] Task 4: 移除硬编码 localhost fallback（P0-Critical）✅ `e09c718`
  - [x] 4.1: `workbench/billing.client.ts` — 移除 `|| 'http://localhost:3006'`，加 fail-closed 守卫
  - [x] 4.2: `workbench/template.client.ts` — 移除 `|| 'http://localhost:3004'`
  - [x] 4.3: `workbench/app.module.ts` — 移除 `|| 'localhost:7233'`
  - [x] 4.4: `benchmark/billing-client.ts` — 移除 fallback，加守卫
  - [x] 4.5: `template/billing.client.ts` — 移除 fallback，加守卫
  - [x] 4.6: `order/billing.client.ts` — 移除 fallback，加守卫
  - [x] 4.7: typecheck 验证通过

## Phase 2: P1 可维护性重构

- [x] Task 5: 拆分 OrderService.handleCallback ✅ `8f7cfbc`
  - [x] 5.1: 提取 `verifyCallbackSignature()` 私有方法
  - [x] 5.2: 提取 `checkIdempotency()` 私有方法
  - [x] 5.3: 提取 `handleNonSuccessState()` 私有方法
  - [x] 5.4: 提取 `findAndBindOrder()` 私有方法（含字段绑定校验）
  - [x] 5.5: 提取 `transactionalUpdate()` 私有方法
  - [x] 5.6: 25/25 测试全部通过（行为零变更）
  - [x] 5.7: E2E 004 purchase-consume 验证（待 Task 8 CI 集成）✅ CI run 32489206816 @ `d1e368e` E2E Tests 作业 success（billing 链路修复批次 `cfaa7e5`+`39c0473` 验证）

- [x] Task 6: 统一 billing.client.ts 到 InternalHttpClient ✅ `73849b6`
  - [x] 6.1: workbench/billing.client.ts — getOrThrow 替代 || process.env
  - [x] 6.2: template/billing.client.ts — getOrThrow + 可选参数带默认值
  - [x] 6.3: order/billing.client.ts — getOrThrow 替代 || process.env
  - [x] 6.4: benchmark/billing-client.ts 重命名为 billing.client.ts + getOrThrow
  - [x] 6.5: admin-service 从 axios 迁移到 InternalHttpClient（新建共享 BillingClient）
  - [x] 6.6: 更新各服务测试（353/353 通过）
  - [x] 6.7: typecheck + 各服务 spec 验证通过

- [x] Task 7: 抽取 bootstrapService() 工厂函数 ✅ `e66f5d5`
  - [x] 7.1: 在 `libs/common/src/bootstrap.service.ts` 创建工厂函数
  - [x] 7.2: 迁移 10/11 个服务 main.ts（media-worker 豁免 — Temporal Worker 结构不同）
  - [x] 7.3: typecheck 通过（平均 60% 行数缩减）

- [x] Task 8: E2E 纳入 CI ✅ CI run 32489206816 E2E Tests success（95/95 全通过）
  - [x] 8.1: CI 增加 docker-compose 启动 postgres/redis/temporal 步骤
  - [x] 8.2: 添加 `npm run test:e2e` 作业（含服务启动 + 健康检查 + E2E 运行）
  - [x] 8.3: 设置 E2E 作业依赖 lint-test（含 build）
  - [x] 8.4: CI 基础设施验证通过（9 服务全部启动，E2E 运行：59 pass / 36 fail - 失败为测试数据问题，非基础设施）
- [x] Task 8b: E2E 测试数据修复（从 CI 暴露的问题）✅ 全部由 billing 链路修复批次解决，E2E 95/95
  - [x] UUID 格式：测试生成 `gen-xxx` / `i2v-xxx` ID 非 UUID 格式（已验证：tests/integration 无残留 gen-/i2v- 模式）
  - [x] 积分配置：NEW_USER_BONUS_POINTS=100 但部分测试需要 300+（已验证：ci.yml L287 设 NEW_USER_BONUS_POINTS=2000）
  - [x] OSS Mock：OSS_ROLE_ARN 未配置，需启用 mock 模式（已验证：ci.yml L295 设 OSS_MOCK=true）
  - [x] undefined ID：部分测试流程中 ID 为 undefined（E2E 95/95 全通过佐证）

- [x] Task 9: 补全 database 库测试 ✅ `65e199b`（CI run 32707122144 全绿）
  - [x] 9.1: 为 14 个 TypeORM 实体添加字段约束/关系测试（`relations.spec.ts` 校验 11 个关系实体的 ManyToOne/OneToMany 方向、JoinColumn 列名、referencedColumnName、onDelete/nullable 与源 FK 列）
  - [x] 9.2: 验证 snake-naming.strategy 转换逻辑（`snake-naming.strategy.spec.ts`：columnName/joinColumnName/joinTableName 等 15 组用例）
  - [x] 9.3: coverage 验证提升（database 库 Stmts 84.82% / Branch 85.55% / Funcs 43.5% / Lines 89.86%，远超根门禁 52/35/37/52；268 测试全通过）

- [x] Task 10: 统一 Dockerfile 模板 ✅ `199db97`
  - [x] 10.1: 创建 Dockerfile 模板（Node 20-alpine + 多阶段 + 无 HEALTHCHECK）— `docker/Dockerfile.template`
  - [x] 10.2: 逐个迁移 11 个服务 Dockerfile（template-service 从 Node 18 升级到 20）
  - [x] 10.3: 统一 CMD 路径为 `apps/SERVICE/dist/main.js`（配合 per-project tsconfig.build.json 扁平产物）
  - [x] 10.4: Docker build 11/11 验证 ✅ CI run 32691433647（构建链路修复批次 `6cbe580`+`0198ca6`+`1bf952f` 验证）

- [x] Task 11: 统一 .env.example ✅ 待 commit
  - [x] 11.1: 创建根 `.env.example` 作为权威配置模板（16 分组，初始 73 变量全覆盖，另补小程序/脚本/画像域）
  - [x] 11.2: 统一 DATABASE_PASSWORD、JWT_SECRET 默认值
  - [x] 11.3: 统一微信支付变量名（WECHAT_PAY_API_V3_KEY / WECHAT_PAY_SERIAL_NO / WECHAT_PAY_APPID，废弃 APIV3_KEY/CERT_SERIAL）
  - [x] 11.4: 补全 template-service 缺失配置项（SERVICE_NAME/多库/Redis/Temporal/HTTP 客户端/BILLING_CLIENT_*/TEMPLATE_REWARD_POINTS）
  - [x] 11.5: 交叉校验所有服务 .env.example 与根模板一致（scripts/_verify-env-examples.js，12/12 通过）

- [x] Task 12: 修复 test:integration 脚本 ✅ 根级 jest.integration.config.js 复用 tests/integration 配置
  - [x] 12.1: 修正 package.json 中 `test:integration` 指向（根级 jest.integration.config.js spread tests/integration/jest.config.js + rootDir 修正）
  - [x] 12.2: 验证脚本可执行（配置链有效）

- [x] Task 13: Docker 镜像瘦身优化 ✅ `199db97`
  - [x] 13.1: Dockerfile prod stage 添加 `npm prune --production --legacy-peer-deps`（11 个 Dockerfile 全部生效）
  - [x] 13.2: 完善 `.dockerignore`（排除 test/、coverage/、.git/、01-docs/）
  - [x] 13.3: CI 11/11 镜像构建通过（体积量化留待云托管部署实测）

- [x] Task 14: Temporal 部署方案调研 ✅ `2773199` + `4f6a9fc` + `75ed935` + `d951f66`（CI run 32711669465 全绿）
  - [x] 14.1: 调研 Temporal Server 独立部署方案（对比 CVM+VPC 内网 / 公网直连 / Temporal Cloud / 消息队列重构，选型：短期方案 A——上海 CVM 同 VPC 内网互联）
  - [x] 14.2: 输出部署文档（`01-docs/20-Temporal部署方案.md`：docker-compose 配置、namespace 注册、安全加固、数据库备份、升级 SOP、监控告警、成本估算、风险演进）
  - [x] 14.3: 记录 TEMPORAL_ADDRESS 云托管配置方式（根 `.env.example` + `docker/.env.production.example` 注释落点；云托管 4 服务需挂载上海 VPC + 环境变量；TEMPORAL_MOCK_MODE 生产必须 false）

## Phase 3: P2 一致性改进

- [ ] Task 15: auth-service 异常类型统一
  - [ ] 15.1: `adminLogin` 中 UnauthorizedException/ForbiddenException 改用 BusinessException
  - [ ] 15.2: typecheck + auth.service.spec 验证

- [ ] Task 16: AllExceptionsFilter 注册统一
  - [ ] 16.1: 统一为 `APP_FILTER` 注册方式（main.ts 中的 useGlobalFilters 移到 app.module.ts）

- [ ] Task 17: process.env 改用 ConfigService
  - [ ] 17.1: order.service.ts 微信支付配置改用 ConfigService.get()
  - [ ] 17.2: typecheck 验证

- [ ] Task 18: 文件命名统一
  - [ ] 18.1: `billing-client.ts` 重命名为 `billing.client.ts`

- [ ] Task 19: console.log 改用 Logger
  - [ ] 19.1: asset/template main.ts 移除 console.log + eslint-disable

- [x] Task 20: 更新 CURRENT_ARCHITECTURE.md ✅ 本批次
  - [x] 20.1: 同步 common→database 反向依赖已修复（第四章重写：peerDependencies 已移除 @reelclone/database，database.config.ts 仅 namespace 配置不 import 库）
  - [x] 20.2: 更新部署目标为微信云托管（第一章 API 网关流量路径 + 11 服务矩阵；第五章 5.1/5.4 统一为云托管事实，Docker Compose/Nginx 降级为本地/CI；2.1/2.2 数据归属与部署位置解耦）
  - [x] 20.3: 更新 apps 数量描述（3.1 表：admin-service 进入云托管部署清单、admin-web 静态托管）

- [ ] Task 21: template.client.ts 改用 InternalHttpClient
  - [ ] 21.1: 从 axios 改为 InternalHttpClient
  - [ ] 21.2: typecheck + spec 验证

- [ ] Task 22: admin-web 补充测试
  - [ ] 22.1: 添加 jest 配置
  - [ ] 22.2: 补充 Users/Orders/Reconcile 页面渲染测试

- [ ] Task 23: oss 库补充测试
  - [ ] 23.1: oss.service.ts 补充单元测试
  - [ ] 23.2: sts.service.ts 补充单元测试

## Phase 4: P3 锦上添花（按需执行）

- [ ] Task 24: 删除 8 个 deprecated jwt.strategy.ts 薄封装
- [ ] Task 25: 小程序抽取基础 Modal 组件
- [ ] Task 26: 小程序 taroStorage 提取到 stores/storage.ts
- [ ] Task 27: admin-web 抽取 ListPage 通用组件
- [ ] Task 28: 手写类型迁移到 generated 类型
- [ ] Task 29: 清理 libs/database/src 编译产物
- [ ] Task 30: tsconfig 启用 allowImportingTsExtensions
- [ ] Task 31: 消除生产代码 9 处 any
- [ ] Task 32: 条件编译规范化 + H5 配置预置

# Task Dependencies

- Task 2 独立（可并行）
- Task 3 独立（可并行）
- Task 4 独立（可并行）
- Task 6 依赖 Task 4（billing.client.ts 统一前需先移除 localhost fallback）
- Task 7 独立但建议在 Task 1/2 后执行（JWT 策略统一后再统一 main.ts）
- Task 8 独立（CI 配置变更）
- Task 10 依赖 Task 13（Dockerfile 统一时一并做镜像瘦身）
- Task 14 独立（调研性质）
- Task 21 依赖 Task 6（template.client 改用 InternalHttpClient）
- Phase 2 整体可在 Phase 1 完成后并行执行
- Phase 3 可在 Phase 2 完成后执行
- Phase 4 按需，不阻塞其他 Phase
