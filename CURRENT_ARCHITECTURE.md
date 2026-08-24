# ReelClone 当前架构事实文档

> **本文档由代码和部署配置验证生成，反映当前运行事实。**
> **K8s/Formance/RabbitMQ/Terraform 是 TARGET 架构，不是当前运行事实。**
> **部署目标已切换为微信云托管（WeChat Cloud Run，决策见 [01-docs/18-深度重构方案-微信云托管版.md](01-docs/18-深度重构方案-微信云托管版.md)），生产迁移进行中；`docker/docker-compose.prod.yml` 与 Nginx 配置仅用于本地开发与 CI 基础设施。**
> **任何结构性变更合并后必须更新本文档。**

---

## 一、当前生产入口

生产部署目标为 **微信云托管**，由云托管自带 **API 网关** 统一承接流量（替代原 Nginx 反向代理）：HTTPS 终止、路径分发、按服务内网域名路由。云托管管理容器编排与健康检查，无 docker-compose.prod、无独立 api-gateway 应用。

### 1.1 流量路径

```
Taro 微信小程序 / admin-web（静态托管）
      │  HTTPS
      ▼
微信云托管 API 网关（云托管自带，内网域名转发）
      │  反向代理 + SSL 终止 + 按服务路由
      ▼
11 个后端服务容器（VPC 内网互连，不暴露公网端口）
      │
      ▼
Temporal Server（独立 CVM，同上海 VPC 内网 7233，见 01-docs/20-Temporal部署方案.md）
```

### 1.2 后端服务（云托管部署清单 = CI `build-docker` matrix）

云托管中共 11 个后端服务容器（`auth/user/asset/workbench/benchmark/template/billing/order/notification/admin` 为 HTTP 服务，`media-worker` 为 Temporal Worker 长驻进程）：

| 服务                 | 端口(defaultPort)         | 业务职责                                               | Temporal 角色      |
| -------------------- | ------------------------- | ------------------------------------------------------ | ------------------ |
| auth-service         | 3001                      | 微信登录、JWT 签发与刷新                               | —                  |
| user-service         | 3002                      | 用户资料、绑定手机号、短信                             | —                  |
| asset-service        | 3003                      | 资产素材库、真人形象、OSS STS                          | —                  |
| benchmark-service    | 3004                      | 竞品对标解析                                           | Client             |
| template-service     | 3005                      | 模板、推荐、行业偏好、收藏                             | Client             |
| billing-service      | 3006                      | 积分账本、冻结/释放/结算                               | —                  |
| workbench-service    | 3007                      | 生成任务、作品管理                                     | Client             |
| notification-service | 3008                      | 通知中心、WebSocket 推送                               | —                  |
| order-service        | 3009                      | 套餐订单、微信支付、回调                               | —                  |
| media-worker         | 3010 (MEDIA_WORKER_PORT)  | Temporal Worker：视频生成/对标解析/媒体处理 Activities | Worker（长期驻留） |
| admin-service        | 3011 (ADMIN_SERVICE_PORT) | 运营后台后端（数据管理/对账/审核）                     | —                  |

服务间通过云托管内网域名互连（`SERVICE_URL` 环境变量注入，禁止 localhost fallback，见 Task 4/P0-Critical）。

### 1.3 admin-web / admin-service 现状

- `admin-service`（NestJS）已进入云托管部署清单（CI build-docker matrix 11/11 构建通过）。
- `admin-web`（React + Vite）按 18 方案 R-P1-8 **静态资源托管**（云托管静态托管，无需独立容器）。
- 本地/CI 场景下 Nginx（`docker/nginx/nginx.conf`）仍保留完整 upstream 配置（含 admin 路由预留），仅供开发联调。

### 1.4 不存在的组件（重要）

当前生产环境**没有**以下组件：

- **没有 api-gateway 应用**：由微信云托管自带 API 网关替代，不存在独立的网关服务代码。
- **没有 Terraform / K8s manifests**：仓库中不存在任何 IaC（Terraform）或 Kubernetes 清单目录/文件。
- **没有 K8s 部署**：生产运行在微信云托管（CaaS），并非 Kubernetes。
- **没有 RabbitMQ / Formance Ledger**：见第五章，均属 TARGET 架构。

---

## 二、逻辑数据归属

### 2.1 PostgreSQL（单实例 4 业务库 + 2 Temporal 库）

PostgreSQL 16 单实例多库。本地/CI 由 compose 的 postgres 服务按 `docker/init-db.sql` 初始化；云托管生产环境不部署有状态服务，业务库与 Temporal 两库随自托管数据服务部署（Temporal 库随 Temporal Server 同机部署在上海 CVM，见 [01-docs/20-Temporal部署方案.md](01-docs/20-Temporal部署方案.md)）。逻辑库划分：

| 数据库                | 归属服务                                                         | 说明                                                      |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| `reelclone_main`      | auth / user / asset / workbench / order / notification + billing | 主库，承载用户、资产、作品、订单、通知及 billing 权威余额 |
| `reelclone_billing`   | billing-service                                                  | billing 审计投影（projection）                            |
| `reelclone_template`  | template-service                                                 | 模板与推荐                                                |
| `reelclone_benchmark` | benchmark-service                                                | 对标解析                                                  |
| `temporal`            | Temporal Server                                                  | 工作流执行历史                                            |
| `temporal_visibility` | Temporal Server                                                  | 工作流可见性索引                                          |

> **关键事实**：`reelclone_main` 同时承载 billing 的权威余额与 operation 记录，`reelclone_billing` 仅作为投影库（详见 ADR-001）。

### 2.2 Redis

Redis 7（本地/CI 由 compose 的 redis 服务提供，开启 AOF 持久化 + 密码鉴权；云托管生产环境需自托管）。Redis 被 multiple 服务共享使用，承担缓存 / 限流 / Pub/Sub 角色。

涉及的 Redis key 空间（按服务）：

- **auth** — 会话 / token 刷新
- **user** — 短信验证码 / 用户缓存
- **work**（workbench） — 生成任务状态缓存
- **billing** — 余额缓存 / 限流
- **notification** — 未读数 / WebSocket 状态
- **benchmark / order / template** — 各自业务缓存
- **media-worker** — 工作流状态存储（`workflow-state.store.ts`）

---

## 三、模块职责

### 3.1 应用层（apps/）

| 模块                        | 职责                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/workbench-service`    | Work / GenerationTask 管理、冻结积分、启动/取消/重试 Temporal 工作流。`generation.service.ts` 实测约 742 行。 |
| `apps/billing-service`      | legacy ledger + V2 reservation（预留模型）+ 投影（projection）+ 对账（reconciliation）。                      |
| `apps/auth-service`         | 微信小程序登录、JWT 签发与刷新。                                                                              |
| `apps/user-service`         | 用户资料、绑定手机号、短信验证码。                                                                            |
| `apps/asset-service`        | 资产素材库、真人形象组、OSS STS 签发。                                                                        |
| `apps/benchmark-service`    | 竞品对标解析、触发 Temporal 工作流。                                                                          |
| `apps/template-service`     | 模板/推荐、行业偏好、收藏。                                                                                   |
| `apps/order-service`        | 套餐订单、微信支付、支付回调 Webhook。                                                                        |
| `apps/notification-service` | 通知中心、WebSocket 推送、微信订阅消息。                                                                      |
| `apps/media-worker`         | Temporal Worker，执行视频生成、对标解析、媒体处理 Activities（无业务 HTTP 端口）。                            |
| `apps/miniprogram`          | 业务主客户端（Taro 微信小程序），约 11.5K 生产行。                                                            |
| `apps/admin-web`            | 运营后台前端（React + Vite）。按 18 方案 R-P1-8 静态资源托管（云托管静态托管，无独立容器）。                  |
| `apps/admin-service`        | 运营后台后端（NestJS）。已进入云托管部署清单（CI build-docker matrix 11/11）。                                |

### 3.2 共享库层（libs/）

| 模块                 | 职责                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/temporal`      | 三类 workflow（video-generation / benchmark-analysis / template-generation）、activity 合约、client/worker。                                                                                                                                            |
| `libs/database`      | 四连接（main/billing/template/benchmark）、entity、migration、Redis module、snake-naming 策略。                                                                                                                                                         |
| `libs/common`        | exception / guard / interceptor / filter / pipe / decorator / config / audit / store。包含 DB/Redis **环境变量配置定义**（`config/database.config.ts`、`config/redis.config.ts`，仅 `@nestjs/config` namespace，**不 import** `@reelclone/database`）。 |
| `libs/ai`            | Seedance 视频 AI、LLM 适配、视频下载、视频分析、FFmpeg、prompt 引擎与消毒。                                                                                                                                                                             |
| `libs/oss`           | 阿里云 OSS 服务、STS 签发、key 生成。                                                                                                                                                                                                                   |
| `libs/observability` | health 端点、logger、metrics（HTTP 拦截器与 metrics controller）。                                                                                                                                                                                      |
| `libs/swagger`       | Swagger/OpenAPI 共享配置、JWT Bearer 鉴权、分页/内部 API 装饰器。                                                                                                                                                                                       |

---

## 四、Nx 依赖图现状

基于各 `package.json` 的 `peerDependencies` 实况验证，当前依赖图（**common → database 反向依赖已修复**）：

```
common ───────────▶（无 DB 依赖：peerDependencies 已移除 @reelclone/database）
temporal ──depends on──▶ ai, oss  （ai/oss 为 optional peer）
ai ──depends on──▶ common        （不再传递引入 database）
swagger ──depends on──▶ common
workbench-service ──depends on──▶ common, database, observability, temporal, ai, swagger
```

### 4.1 已修复：common → database 反向依赖

此前的结构问题：`libs/common` 的 `peerDependencies` 曾声明对 `@reelclone/database` 的依赖，且 `libs/common/src/config/` 下存在 `database.config.ts` 与 `redis.config.ts`，导致任何引用 `common` 的模块（如 `ai`、`swagger`）都会传递性引入 `database`，违反「通用库不依赖基础设施」的分层原则。

**现状（已解决）**：

- `libs/common/package.json` 的 `peerDependencies` 已移除 `@reelclone/database`。
- `libs/common/src/config/database.config.ts` 仅作 `@nestjs/config` namespace 配置定义（数据库环境变量），源码中无任何 `import ... from '@reelclone/database'` 语句（Grep 仅命中说明性注释）。

### 4.2 当前传递依赖链

```
workbench-service
  ├── common
  ├── database
  ├── observability
  ├── temporal ──▶ ai ──▶ common
  │            └──▶ oss
  ├── ai ──▶ common
  └── swagger ──▶ common
```

---

## 五、当前运行事实（重要）

以下事实必须与目标架构严格区分：

### 5.1 当前部署形态：微信云托管（非 K8s）

- **当前运行事实**：生产部署目标为微信云托管（CaaS），容器编排与健康检查由云托管管理，生产迁移进行中；`docker/docker-compose.prod.yml` 与 Nginx 配置仅用于本地开发与 CI 基础设施。
- **目标架构**：K8s 部署（见 `01-docs/03-技术架构方案.md`，属 TARGET，未实现）。
- 仓库中**不存在**任何 K8s manifest、Helm chart 或 Terraform 配置。

### 5.2 当前没有 Formance Ledger

- **当前运行事实**：使用自建 V2 reservation 模型（`libs/database/src/entities/credit-reservation.entity.ts` + `reelclone_main` 中的权威余额与 operation）。
- **目标架构**：Formance Ledger（见 `01-docs/03-技术架构方案.md`，属 TARGET，未引入）。
- billing-service 同时保留 legacy ledger 与 V2 reservation 两套路径。

### 5.3 当前没有 RabbitMQ

- **当前运行事实**：服务间同步通信通过 HTTP（axios），异步通过 Temporal 工作流；没有消息队列。
- **目标架构**：RabbitMQ（见 `01-docs/03-技术架构方案.md`，属 TARGET，未引入）。

### 5.4 生产入口：云托管 API 网关（无独立 api-gateway 应用）

- **当前运行事实**：生产流量由微信云托管自带 API 网关承接（HTTPS 终止、SSL 卸载、按服务内网域名转发至 11 个服务容器）。
- Nginx（`docker/nginx/nginx.conf`）保留完整 upstream/限流（auth/sms/api 三级 limit_req_zone）/WebSocket 升级配置，但**仅用于本地开发与 CI**。
- **没有**独立 api-gateway 应用。

---

## 六、文档分层维护约定

- **本文档（CURRENT_ARCHITECTURE.md）** 是当前运行事实的**唯一权威**。
- `01-docs/03-技术架构方案.md` 已标记为 **TARGET 架构文档**，描述的是目标架构，不反映当前运行事实。
- 目标架构中的组件（K8s / Formance / RabbitMQ / Terraform）只有在达到明确规模与运维触发条件后，才会被重新评估引入。
- 任何结构性变更（新增/删除服务、数据库变更、依赖图变化、部署方式变更）合并后**必须更新本文档**。
