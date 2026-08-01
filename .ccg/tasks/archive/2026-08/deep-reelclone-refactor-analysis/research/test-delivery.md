# ReelClone 测试、交付与运维就绪度审计

> 审计快照：`master` / `2ffed0e`（与 `origin/master` 同步），2026-08-01。
> 范围仅覆盖测试架构、CI、构建、Docker/部署、可观测性与运维准备度；未审计业务正确性。

## 结论

当前仓库有数量可观的单元测试、真实覆盖率阈值、OpenAPI 生成一致性检查，也有 Compose、部署/回滚/备份脚本和一套可观测性库。但交付链路仍属于“开发资产已铺开，生产闭环未成立”：CI 可以在没有编译任何应用、没有构建任何当前主分支 Docker 镜像、没有运行集成/E2E、没有验证迁移和生产 Compose 的情况下通过；生产 Compose 的多数业务健康检查路径与代码不一致；镜像打包路径、Temporal/数据库初始化、监控采集与灾备也存在阻断级缺口。

因此，当前 CI 绿灯只能证明静态检查、两组 Jest 覆盖率和 fixture 驱动的 OpenAPI 类型一致性，不能证明“可构建、可容器启动、可迁移、可部署、核心生成链路成功或可恢复”。

## Gate Truth Table

| 门禁                   | 当前性质                                | 证据与判断                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                 | **真实但范围不完整**                    | CI 执行 `npm run lint`（`.github/workflows/ci.yml:58-59`）；脚本只匹配 `apps/**/src/**/*.ts` 和 `libs/**/src/**/*.ts`，未覆盖 TSX、集成测试、脚本和配置（`package.json:13`）。本次实跑通过。                                                                                                            |
| TypeScript             | **真实但漏掉小程序**                    | CI 执行根 `tsc`（`.github/workflows/ci.yml:61-62`, `package.json:14`）；根配置明确排除 `apps/miniprogram`（`tsconfig.base.json:51`）。本次实跑通过。                                                                                                                                                    |
| OpenAPI 生成一致性     | **真实，但只验证 fixture -> generated** | CI 会生成后 `git diff --exit-code`（`.github/workflows/ci.yml:64-68`, `package.json:28`）；没有从实时 controller 提取并与 fixture 比对，不能证明服务契约未漂移。                                                                                                                                        |
| 后端单测覆盖率         | **真实配置门禁**                        | CI 执行 coverage（`.github/workflows/ci.yml:70-71`）；全局阈值为 statements/branches/functions/lines = 50/33/35/50（`jest.config.js:24-34`）。全局平均值可掩盖支付、迁移、工作流等单模块空洞。                                                                                                          |
| 小程序单测覆盖率       | **真实配置门禁**                        | CI 执行独立 Jest coverage（`.github/workflows/ci.yml:73-76`），阈值 70/55/70/70（`apps/miniprogram/jest.config.js:31-39`）。但 `isolatedModules` 只转译不类型检查（同文件 `15-18`）。                                                                                                                   |
| 根 Build               | **伪门禁**                              | CI 的 Build 调用 `npm run build`（`.github/workflows/ci.yml:87-88`），脚本只有 `echo`（`package.json:23`），不执行仓库中已有的 Nx build targets。Ubuntu CI 会无编译成功；本机 Windows 实跑还因字符串中的 `<service> &&` 产生 shell 解析错误。                                                           |
| Docker Build           | **当前主分支完全不生效**                | job 只在 `refs/heads/main` 运行（`.github/workflows/ci.yml:90-95`），当前分支为 `master`；matrix 用 `auth/user/...` 并查找 `apps/<name>/Dockerfile`（`99-109`），实际路径均为 `apps/*-service/Dockerfile`。不存在时明确打印 placeholder 后成功（`104-114`）。media-worker/admin-service 也不在 matrix。 |
| 小程序 Build           | **伪门禁**                              | CI 检查根 npm 是否有 `build:weapp`，没有就跳过（`.github/workflows/ci.yml:135-142`）；真实 target 在 `apps/miniprogram/project.json:16-22`。整步还设置 `continue-on-error: true`（CI `135-136`）。                                                                                                      |
| 集成/E2E               | **非 CI 门禁，且入口之一已坏**          | CI 没有调用任何 integration/E2E script。`test:integration` 指向不存在的 `jest.integration.config.js`（`package.json:19`），本次实跑报 “Can't find a root directory while resolving ...”。另有 `test:e2e` 指向 `tests/integration`（`20-22`），但仅供手工执行。                                          |
| 迁移/生产 Compose/发布 | **无 CI/CD 门禁**                       | CI 没有 fresh DB migration、upgrade、Compose render/up、镜像 smoke、registry push 或部署 job；Docker job还明确“不推送”（`.github/workflows/ci.yml:104-111`）。                                                                                                                                          |
| Review/双人审批        | **仓库内仅提醒，是否强制未知**          | PR workflow 只是发表评论列出审批清单（`.github/workflows/pr.yml:48-78`），PR 模板也是复选框（`.github/pull_request_template.md:44-52`）。分支保护属于 GitHub 外部状态，本次无法从仓库确认。                                                                                                             |

## Findings

### Critical

#### C-1. CI 会在没有应用构建产物和容器验证的情况下绿灯

- 根 build 是 echo（`package.json:23`），而每个服务已经有真实 Nx `build` target，例如 `apps/auth-service/project.json:31-37`、`apps/miniprogram/project.json:16-22`，CI 却没有调用它们。
- Docker job 在当前 `master` 永不运行，且即使切到 `main`，matrix 路径也全部与 `*-service` 目录不匹配，缺文件分支仍返回成功（`.github/workflows/ci.yml:94-114`）。
- 这会让 TypeScript 能通过但实际 emit、workspace 运行时解析、Docker COPY/CMD、原生依赖、Taro/Vite 打包全部未验证。

**建议**：将根 build 改成确定性的 `nx run-many -t build --all`（前端按各自 target），CI 对 PR 和 `master` 均执行；Docker matrix 使用真实 project name/Dockerfile 路径，缺文件必须失败。对每个镜像执行 `docker build` 后的 `node`/HTTP smoke test，并增加 `docker compose config` 与 clean-volume startup test。

#### C-2. 多数生产镜像的产物布局和 workspace 依赖打包没有一致契约

- 根 TS 配置把 `rootDir` 设为仓库根（`tsconfig.base.json:4`），服务只设置自己的 `outDir`（例如 `apps/notification-service/tsconfig.json:2-16`），实际 emit 形成 `dist/apps/<service>/src/main.js`；仓库现存 notification 构建产物也印证了这一布局。
- notification 镜像却启动 `apps/notification-service/dist/main.js`（`apps/notification-service/Dockerfile:45-58`）。user/asset/benchmark/billing/workbench/order 等也大多假设扁平 `dist/main.js`（例如 `apps/user-service/Dockerfile:31-50`、`apps/billing-service/Dockerfile:31-40`）。auth/media-worker 使用另一种嵌套路径（`apps/auth-service/Dockerfile:33-44`、`apps/media-worker/Dockerfile:34-47`）。
- 多个 Dockerfile只编译应用，却从 builder 拷贝 `libs/*/dist`（例如 billing `apps/billing-service/Dockerfile:19-36`）；clean checkout 中这些库产物并未由该命令保证生成。`npm ci || npm install` fallback 还会掩盖锁文件/安装问题（同文件 `19`）。workspace 包的 `main` 又指向 TS 源码，例如 `libs/database/package.json:6-7`，与“只拷贝 dist”不匹配。
- 仓库没有 `.dockerignore`，本地 `.env`、`.git`、coverage、node_modules 会进入 build context；即使未 COPY 到最终层，也增加泄密面、构建体积与非确定性。

**建议**：统一为一个可复现的镜像工厂：Nx/webpack/esbuild 产出自包含 bundle，或使用 `npm workspaces` 的 production prune 并保留正确 package metadata；每个 app 明确唯一 `outputPath` 和 start command。禁止 `npm ci || npm install`，加入 `.dockerignore`、non-root `USER`、固定 Node major/digest，并在 CI clean checkout 构建和启动全部镜像。

#### C-3. 生产 Compose 的健康检查与真实路由不一致，部署很可能永远无法收敛

- 通用健康控制器只声明 `@Controller('health')`（`libs/observability/src/health/health.controller.ts:41-50`）；各服务又设置全局 `api/v1` 前缀，例如 `apps/user-service/src/main.ts:27`，所以通用路径是 `/api/v1/health`。
- prod Compose 却探测 `/api/v1/users/health`、`/assets/health`、`/benchmarks/health`、`/templates/health`、`/points/health`、`/generations/health`、`/notifications/health`、`/orders/health`（`docker/docker-compose.prod.yml:211-212,240-241,273-274,302-303,332-333,367-368,396-397,425-426`）。代码搜索只发现 auth/admin 的业务前缀 health 和 media-worker `/health`；上述 8 条路径没有实现。
- 通用 HealthController 没有 `@Public()`，而服务普遍注册全局 JWT guard（例如 `apps/asset-service/src/app.module.ts:65-69`、`apps/order-service/src/app.module.ts:60-64`），即便改成 `/api/v1/health` 也会得到 401。
- nginx 依赖这些服务全部 healthy 后才启动（`docker/docker-compose.prod.yml:491-509`），因此错误探针会阻止 nginx 启动。
- 即使路径修好，通用 health 在依赖 down 时只返回 `{status:'error'}`，没有设置 HTTP 503（`libs/observability/src/health/health.controller.ts:49-65`），wget 仍把 HTTP 200 当健康。media-worker 也固定返回 `status: 'ok'`，只把 `worker.running` 放在 body（`apps/media-worker/src/app.module.ts:34-45`）。

**建议**：统一公开且绕过业务 guard 的 `/livez` 与 `/readyz`。liveness 只证明进程，readiness 必须检查正确命名的 DB、Redis、Temporal namespace/worker polling 状态并在失败时返回 503。Compose、E2E、部署脚本只引用这一份路由契约，并为 probe contract 加单测和容器集成测试。

#### C-4. 生产数据库/Temporal 初始化契约互相矛盾

- production env 允许自定义 `DATABASE_USER` 和强制替换 `TEMPORAL_DB_PASSWORD`（`docker/.env.production.example:20-35`），但 init SQL 把所有业务库 owner 固定为 `reelclone`，Temporal 密码固定为 `temporal`（`docker/init-db.sql:15-29,35-54`）。按示例替换 Temporal 密码后，Temporal 容器拿到的新密码（`docker/docker-compose.prod.yml:123-129`），数据库角色却仍是 `temporal` 密码，认证将失败。
- dev Compose 明确使用 auto-setup 所需 `DB: postgres`（`docker/docker-compose.yml:53-68`），prod 改成 `DBPLUGIN: postgres`（`docker/docker-compose.prod.yml:118-130`），但没有 clean-volume smoke test 证明这一差异有效。
- 应用/worker 默认使用 namespace `reelclone`（`docker/.env.production.example:88-95`, `apps/media-worker/src/worker/worker.bootstrap.ts:64-66`），而 Compose、init-db、deploy/tools 中没有 namespace 创建/注册步骤。
- Temporal 只有 `service_started` 依赖、没有 readiness；media-worker 也不在 nginx 的依赖或 deploy 成功判断内（`docker/docker-compose.prod.yml:457-466`, `scripts/deploy.sh:61-72,276-283`）。

**建议**：将 fresh infrastructure bootstrap 做成幂等 init job，不在静态 SQL 中硬编码可变凭证；显式创建/验证 Temporal namespace；为 Temporal 添加 CLI health/namespace check。CI 必须从空 volume 启动 prod-like stack，执行全部迁移、启动 worker、提交一个最小 workflow 并等待成功。

#### C-5. “95 个 E2E”不是交付门禁，且环境保护代码实际未执行

- E2E 配置把 `setup.ts` 放在 `setupFilesAfterEnv`（`tests/integration/jest.config.js:20`），但 `setup.ts` 只 `export default async function setup()`（`tests/integration/setup.ts:154-168`），既没有顶层调用也没有 `beforeAll`；Jest 加载 setup module 时不会自动调用该导出。因此 DB 清理/seed、mock 检查和服务健康检查是死代码。
- 即使调用，mock 开关缺失也只告警并继续（`tests/integration/setup.ts:48-67`），有误触真实微信/支付/AI 环境的风险；健康 fallback 还把 404/401 当“服务已响应”（`131-149`）。
- 配置注释声称 flows 先于 api、按文件名排序（`tests/integration/jest.config.js:23-29`），但未配置 custom test sequencer；`maxWorkers:1` 不等于该排序契约。
- 核心流程明确运行 mock Temporal（`tests/integration/flows/002-upload-generate-download.spec.ts:117-145`），并把 `FAILED` 当可接受终态；benchmark 和 3D 生成也接受失败（`003-benchmark-generate.spec.ts:76-88`, `005-avatar-group-generate.spec.ts:220-237`）。这不能证明核心生成成功。
- CI 完全不运行 E2E；手工启动脚本硬编码本机路径和 fnm session（`tools/start-e2e.ps1:5-6`, `tools/start-e2e-services.bat:5-8`），两套脚本服务清单还不一致。

**建议**：改用 `globalSetup`（真正初始化一次）或显式 `beforeAll`，每套测试使用独立 schema/database namespace，禁止跨文件顺序依赖。测试进程与被测服务均强制 fail-closed mock policy。PR 至少跑 Postgres/Redis + app 的 API contract；nightly 跑真实 Temporal worker；预发布再跑受控 provider sandbox。成功路径必须断言 `COMPLETED/SUCCESS`、产物可读、积分/订单最终一致，失败路径单独测试补偿。

### High

#### H-1. 数据迁移没有验证闭环，并可被部署脚本人工跳过

- `libs/database` 没有任何 spec；CI 不启动 PostgreSQL，也不执行 migration runner。
- migration generator 仍是成功退出的 TODO（`libs/database/package.json:13-14`）。
- 部署在宿主机运行 `npx nx run-many --target=migration:run`；没有 npx 时直接跳过，迁移失败时也允许输入 Y 继续（`scripts/deploy.sh:225-240`）。四库迁移按库串行提交（`libs/database/src/migration-runner.ts:43-100`），后库失败时前库已升级，没有兼容性门禁或自动恢复。

**建议**：CI 增加 fresh schema + N-1 snapshot upgrade + migration rerun/idempotency；迁移失败必须阻断发布。使用 expand/contract 兼容策略、版本化 migration image/job 和部署前 verified backup，移除“继续启动”路径。

#### H-2. 小程序和前端构建在 CI 中没有发布级验证

- 根 typecheck 排除 miniprogram（`tsconfig.base.json:51`），miniprogram Jest 使用 `isolatedModules`（`apps/miniprogram/jest.config.js:15-18`），lint 又不匹配 TSX（`package.json:13`）。
- CI build:weapp 永远通过 skip/continue（`.github/workflows/ci.yml:135-142`）。admin-web 的 Vite build target存在（`apps/admin-web/project.json:16-22`）但根 build 不调用。

**建议**：为 miniprogram/admin-web 建独立 `lint + tsc --noEmit + production build` 门禁；产物做体积预算、source map/环境注入检查，至少有一个 Playwright/小程序自动化 smoke flow。

#### H-3. 可观测性停在代码层，没有形成采集、关联和告警

- 服务导入 Logger/Health/Metrics（例如 `apps/auth-service/src/app.module.ts:45-60`），Prometheus controller 能输出 `/metrics`（`libs/observability/src/metrics/metrics.controller.ts:11-16`）。但 Compose 中没有 Prometheus/Grafana/Alertmanager/OTel collector、scrape config、dashboard 或 alert rule；nginx 也不路由 metrics。
- MetricsController 同样没有 `@Public()`，在全局 JWT guard 下通常不可抓取。
- Pino `LoggerService` 已实现（`libs/observability/src/logger/logger.service.ts:18-65`），但业务代码仍普遍 `new Logger(...)`，各 main 没有 `app.useLogger`，所以“结构化 Pino 日志”并未成为统一运行时日志。
- nginx 生成并向上游发送 `X-Request-Id`（`docker/nginx/nginx.conf:145-146`），应用却读取/返回 `x-trace-id`（`libs/common/src/utils/tracing.util.ts:9-13`）；nginx JSON 日志记录的是客户端 `$http_x_request_id`（`docker/nginx/nginx.conf:41-55`），不是生成的 `$request_id`。服务间 axios/Temporal 也未见 trace header 传播。
- tracing util 注释称 AsyncLocalStorage，实际是进程全局可变变量（`libs/common/src/utils/tracing.util.ts:21-22,47-62`）；若未来使用会在并发请求间串 trace。

**建议**：统一 Nest logger adapter，默认输出 service/version/environment/traceId/workflowId/user-safe-id；用真正 AsyncLocalStorage 或 OpenTelemetry Context，统一 W3C `traceparent` 并传播到 HTTP/Temporal。部署 collector + Prometheus + 日志后端，定义核心 RED/USE、队列 lag、workflow failure、billing reconciliation、outbox backlog 指标和告警；为每条 SLO配置 dashboard、burn-rate alert 和 runbook。

#### H-4. 文档 SLO 与真实灾备能力差一个数量级

- 运维计划声明 RPO <=1 小时、RTO <=2 小时，并包含对象存储（`01-docs/04-开发运维计划.md:115-124`）。实际部署文档只“建议”每天 03:00 通过宿主机 crontab 备份（`docs/DEPLOYMENT.md:562-576`），理论 RPO 约 24 小时，而且仓库无法证明 cron 已安装。
- backup 脚本只 dump 四个业务库（`scripts/backup-db.sh:49-62`），遗漏 Temporal/visibility、Redis AOF、OSS 对象/元数据一致性；备份写到同机 `docker/backups`，无加密、校验、异地复制或不可变保留。
- restore 只警告服务应停止但不强制，并对断连/drop/create 使用 `|| true` 后继续导入（`scripts/backup-db.sh:268-305`）；没有自动 restore drill 或数据一致性验证。

**建议**：以目标 RPO/RTO反推 PostgreSQL PITR/WAL 归档、Temporal DB、对象存储版本/跨区域复制和 Redis 持久化策略；备份异地加密并带 checksum/manifest。每月至少自动恢复到隔离环境，跑账务、订单、作品/对象引用和 Temporal workflow 一致性验收并记录实际 RTO。

#### H-5. 发布依赖服务器现场构建和 mutable `latest`，无制品供应链

- prod Compose 全部使用 `reelclone/*:latest`（例如 `docker/docker-compose.prod.yml:171-177,443-449`）；CI 明确不推 registry（`.github/workflows/ci.yml:104-111`）。deploy 直接 `git pull` 后在生产机 build（`scripts/deploy.sh:154-195`），pull 失败还能选择本地代码继续（`167-173`）。
- rollback 通过 `git reset --hard` 到 commit 后重新 build（`scripts/rollback.sh:125-139,145-157`），无法保证依赖/base image与原发布一致；数据库也只提示人工处理。
- CI 没有 dependency/container/secret scan、SBOM、签名、provenance 或 staged deployment。

**建议**：CI 构建一次，生成 digest 不可变镜像，执行 SCA/secret scan/Trivy、SBOM 和签名后推 registry；部署只消费已验证 digest，并记录 release manifest（commit、migration、image digests、config version）。通过受保护 environment 做预发布 smoke、审批、滚动/蓝绿发布和自动回退。

### Medium

#### M-1. Jest/Nx 配置重复且互相漂移

- 根 Jest 注释称“projects 模式”，实际没有 `projects` 字段，只用一套 root transform（`jest.config.js:1-14`）；各 app/lib 又维护独立配置，CI 根测试不会使用这些差异。
- `libs/observability/project.json:31-37` 和 package script（`libs/observability/package.json:8-12`）引用不存在的 `libs/observability/jest.config.js`；通过 Nx/单包执行会失败，根 Jest却能发现其 9 个 spec。
- Nx test cache input 引用不存在的根 `jest.preset.js`（`nx.json:34-38`），而 CI 恢复 Nx cache（`.github/workflows/ci.yml:46-56`）却运行 raw eslint/tsc/jest/echo，几乎不消费 Nx task cache。
- 当前共有 98 个 spec（72 backend/lib、16 miniprogram、10 integration），但 `libs/database` 为 0；全局覆盖率无法体现关键模块最低标准。

**建议**：选择一种执行模型：推荐 Nx + 共享 Jest preset，每项目只保留少量 override；CI 用 affected/full run-many，缓存才有意义。对 auth/billing/order/workbench/Temporal/database 设 per-project 和 changed-lines coverage，并加入 mutation/contract tests，而不是只看全局均值。

#### M-2. 部署成功判据过于间接

- deploy 只轮询 nginx 容器 healthy（`scripts/deploy.sh:257-283`）；nginx `/health` 是静态 200（`docker/nginx/nginx.conf:99-113,149-155`），不是上游聚合检查。
- media-worker 不在 `SERVICES` 列表（`scripts/deploy.sh:61-72`），Temporal 也没有健康判据；运行中上游后来失效时 nginx 仍保持 healthy。
- 生产证书目录/文件不在仓库，deploy prerequisite 只检查 Docker/Git/env（`scripts/deploy.sh:107-148`），没有检查证书、磁盘、端口、provider credentials、mock=false 或容量水位。

**建议**：发布完成必须逐服务验证 readiness、worker poller、Temporal namespace、数据库 migration version、nginx 路由和一条无副作用业务 smoke；预检要机器可读且 fail closed，禁止交互式越过 placeholder/migration/pull 失败。

#### M-3. PR 安全与治理信号没有变成最小权限的强制策略

- PR workflow 在 workflow 级授予 `pull-requests: write`（`.github/workflows/pr.yml:8-11`），commitlint job 会 checkout PR 代码并执行 `npm install`（`25-46`）；写权限本只需提醒 job，应缩到 job 级，安装应使用 lockfile 和禁用不必要 lifecycle。
- “1 人/核心 2 人 review”仅是评论文本（`.github/workflows/pr.yml:63-69`）；没有 CODEOWNERS 文件。外部 branch protection 可能存在，但未在本审计中验证。

**建议**：提醒 job 单独授予 PR write；验证 job `contents:read`、`npm ci --ignore-scripts`（如可行）并固定 actions commit SHA。通过 branch protection/ruleset + CODEOWNERS 强制 required checks、核心目录双人审批、禁止直接 push。

## Dependencies

```text
push / pull_request
  -> .github/workflows/ci.yml: lint-test
     -> root eslint (partial scope)
     -> root tsc (excludes miniprogram)
     -> fixture-based OpenAPI generation check
     -> root Jest coverage + miniprogram Jest coverage
     -> root build echo (no artifacts)
  -> build-docker (only refs/heads/main; wrong paths; skip succeeds)
  -> build-miniprogram (script missing; continue-on-error)

manual E2E
  -> tools/start-e2e*.{ps1,bat} (machine-specific process launcher)
  -> tests/integration Jest
  -> 8/9 local HTTP services + PostgreSQL (+ Redis/Temporal depending on mock)
  -> setup safety/cleanup currently not invoked

manual production deploy
  -> scripts/deploy.sh
  -> git pull mutable checkout
  -> docker-compose.prod.yml build from heterogeneous Dockerfiles
  -> host-side Nx migration runner across 4 DBs
  -> postgres/redis -> services -> nginx
  -> success currently inferred from static nginx health

runtime observability
  -> app imports LoggerModule/HealthModule/MetricsModule
  -> /api/v1/health and /api/v1/metrics controllers
  -> no scraper / collector / log backend / alert manager

disaster recovery
  -> scripts/backup-db.sh -> local pg_dump gzip for 4 DBs
  -> same-host docker/backups, 7-day cleanup
  -> no automated offsite copy or restore verification
```

## Patterns

以下模式值得保留并扩展，而不是推倒重来：

- CI 主 job 使用 `contents: read` 最小权限、完整 checkout、`npm ci`、Node 20 和 concurrency cancellation（`.github/workflows/ci.yml:9-20,27-41`）。
- 后端与 miniprogram 都有明确 coverage threshold；coverage artifact 即使失败也上传（`.github/workflows/ci.yml:70-85`）。
- OpenAPI generated diff 是可复现契约资产的正确雏形（`.github/workflows/ci.yml:64-68`）。
- Compose 对 PostgreSQL/Redis 有基础 healthcheck，生产配置有日志轮转（`docker/docker-compose.prod.yml:23-41,64-70,97-103`）。
- 部署/备份脚本采用 `set -euo pipefail`（`scripts/deploy.sh:27`, `scripts/backup-db.sh:20`）；backup 使用 `pg_dump | gzip` 并产出 manifest（`scripts/backup-db.sh:117-157`）。
- media-worker 对 SIGTERM/SIGINT 有显式先停 Worker 再关 Nest 的流程（`apps/media-worker/src/main.ts:40-59`），应推广到所有长跑服务。
- Nginx 已有 JSON access log 与 request-id 生成基础（`docker/nginx/nginx.conf:38-58,145-146`），只需统一字段并接入采集。

## Refactor Order

1. **P0 / 先消灭 false green**：真实 Nx/Taro/Vite build；修正 Docker matrix 和 master/PR trigger；clean checkout build + image smoke；统一 public livez/readyz；修复 init credential/Temporal namespace；把成功断言的 E2E 接入 CI。
2. **P1 / 建立可发布制品**：迁移集成测试；registry digest、scan/SBOM/sign；prod-like Compose smoke；预发布环境与自动回滚；去掉所有 interactive continue。
3. **P1 / 建立可运营闭环**：统一日志/trace，部署 Prometheus/collector/log backend，围绕生成、支付、积分、outbox、Temporal 定义 dashboard/alert/runbook。
4. **P1 / 满足灾备目标**：PITR + OSS/Temporal 完整备份、异地不可变副本、定期自动恢复演练，用实测 RPO/RTO替代文档目标。
5. **P2 / 收敛工程系统**：共享 Jest preset/Nx 执行，按关键项目覆盖率，移除重复硬编码 E2E 启动器，落实 ruleset/CODEOWNERS 和 scheduled load/security/real-provider sandbox tests。

## Files Found

- `.github/workflows/ci.yml`：主 CI；含真实静态/coverage gate 与 build/Docker/miniprogram placeholders。
- `.github/workflows/pr.yml`：commitlint 和非强制 review 提醒。
- `package.json`, `jest.config.js`, `nx.json`：根脚本、覆盖率和 task graph；多处执行模型漂移。
- `apps/*/project.json`, `apps/*/jest.config.js`：真实 per-project targets/configs，但主 CI 大多绕过。
- `tests/integration/**`, `tools/start-e2e*`：95-case 手工 E2E 资产及机器特定 launcher。
- `apps/*/Dockerfile`：10 个服务镜像定义，输出布局和 workspace 打包策略不统一。
- `docker/docker-compose.yml`：可渲染的本地基础设施（Postgres/Redis/Temporal），不含应用。
- `docker/docker-compose.prod.yml`, `docker/init-db.sql`, `docker/nginx/**`：生产拓扑、探针、DB bootstrap 和入口代理。
- `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/backup-db.sh`：现场构建式发布、git rebuild 回滚、同机四库备份。
- `libs/observability/**`, `libs/common/src/utils/tracing.util.ts`：日志/health/metrics/trace building blocks，尚未接成运行闭环。
- `01-docs/04-开发运维计划.md`, `docs/DEPLOYMENT.md`：SLO/RPO/RTO 与手工部署说明；目标高于当前自动化能力。

## Risks

- **False green**：最可能的近期风险；PR 可合并不可编译/不可启动镜像。
- **Fresh deployment failure**：健康路径、镜像入口、Temporal 用户/namespace 任一项都可阻断空环境部署。
- **Silent core failure**：mock E2E 和接受 FAILED 的断言无法发现真实生成链路失败；部署成功也不检查 worker。
- **Unobservable incidents**：有 metrics/log code，但无采集/告警/trace propagation，故障只能手工翻容器日志。
- **Unrecoverable data gap**：当前 backup 无法满足声明的 1h RPO，也不覆盖 Temporal/OSS，恢复未经演练。
- **Non-reproducible rollback**：现场重建 `latest` 无法保证恢复到原制品，数据库变更又独立演进。

## Validation Performed

- `git status --short --branch` / `git log`：确认审计基于 `master` `2ffed0e`，工作区原有未跟踪 CCG/Codex 文件未触碰。
- `.ccg/spec/`：当前不存在，无额外项目 spec 可读取。
- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm run build`：确认没有执行编译；Windows shell 还暴露脚本文本不可移植。
- `npm run test:integration -- --runInBand`：失败，缺少 `jest.integration.config.js`。
- `docker compose -f docker/docker-compose.yml config --quiet`：本地 infra Compose 可渲染（Docker config 权限 warning 不影响结果）。
- 未运行全量 coverage、全部 Docker build 或真实 provider/生产 Compose E2E；因此没有把配置中的 gate 当作当前通过证据。
