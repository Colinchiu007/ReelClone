# ReelClone 当前架构事实文档

> **本文档由代码和部署配置验证生成，反映当前运行事实。**
> **K8s/Formance/RabbitMQ/Terraform 是 TARGET 架构，不是当前运行事实。**
> **任何结构性变更合并后必须更新本文档。**

---

## 一、当前生产入口

当前生产部署基于 **Docker Compose**（`docker/docker-compose.prod.yml`），入口为 **Nginx 反向代理**，唯一对外暴露端口为 80/443。

### 1.1 流量路径

```
Taro 微信小程序
      │  HTTPS
      ▼
Nginx (docker/docker-compose.prod.yml → nginx 服务)
      │  反向代理 + SSL 终止 + 限流
      ▼
9 个业务微服务（backend 内网，不暴露端口）
```

### 1.2 Nginx 上游服务（生产 Compose 实际配置）

Nginx `upstream` 定义了 9 个业务服务（见 `docker/nginx/nginx.conf`）：

| 上游名称             | 后端服务             | 端口 | 业务职责                      |
| -------------------- | -------------------- | ---- | ----------------------------- |
| auth_service         | auth-service         | 3001 | 微信登录、JWT 签发与刷新      |
| user_service         | user-service         | 3002 | 用户资料、绑定手机号、短信    |
| asset_service        | asset-service        | 3003 | 资产素材库、真人形象、OSS STS |
| benchmark_service    | benchmark-service    | 3004 | 竞品对标解析                  |
| template_service     | template-service     | 3005 | 模板、推荐、行业偏好、收藏    |
| billing_service      | billing-service      | 3006 | 积分账本、冻结/释放/结算      |
| workbench_service    | workbench-service    | 3007 | 生成任务、作品管理            |
| notification_service | notification-service | 3008 | 通知中心、WebSocket 推送      |
| order_service        | order-service        | 3009 | 套餐订单、微信支付、回调      |

此外 `media-worker`（Temporal Worker，无业务端口，仅 `/health`）作为后台执行组件运行，不直接承接 HTTP 流量。

### 1.3 admin-web / admin-service 现状

- `apps/admin-service` 与 `apps/admin-web` **仅有源码**。
- 生产 Compose（`docker-compose.prod.yml`）中**没有** admin-service 容器，也没有 admin-web 的静态托管 upstream。
- Nginx 配置中**没有** admin 相关路由。
- 结论：admin 侧当前**没有生产 upstream 或容器**，仅源码存在。

### 1.4 不存在的组件（重要）

当前生产环境**没有**以下组件：

- **没有 api-gateway 应用**：Nginx 直接按路径分发到 9 个微服务，不存在独立的网关服务。
- **没有 Terraform / K8s manifests**：仓库中不存在任何 IaC（Terraform）或 Kubernetes 清单目录/文件。
- **没有 K8s 部署**：生产运行在单机 Docker Compose，并非 Kubernetes。

---

## 二、逻辑数据归属

### 2.1 PostgreSQL（单实例 4 业务库 + 2 Temporal 库）

生产使用单一 PostgreSQL 16 实例（`docker-compose.prod.yml` → postgres 服务），通过 `docker/init-db.sql` 初始化以下数据库：

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

生产使用 Redis 7（`docker-compose.prod.yml` → redis 服务，开启 AOF 持久化 + 密码鉴权）。Redis 被 multiple 服务共享使用，承担缓存 / 限流 / Pub/Sub 角色。

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
| `apps/admin-web`            | 运营后台前端（React + Vite）。当前无生产部署。                                                                |
| `apps/admin-service`        | 运营后台后端（NestJS）。当前无生产部署。                                                                      |

### 3.2 共享库层（libs/）

| 模块                 | 职责                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/temporal`      | 三类 workflow（video-generation / benchmark-analysis / template-generation）、activity 合约、client/worker。                                                                                               |
| `libs/database`      | 四连接（main/billing/template/benchmark）、entity、migration、Redis module、snake-naming 策略。                                                                                                            |
| `libs/common`        | exception / guard / interceptor / filter / pipe / decorator / config / audit / store。**包含 DB/Redis 基础设施配置**（`config/database.config.ts`、`config/redis.config.ts`），因此**反向依赖 database**。 |
| `libs/ai`            | Seedance 视频 AI、LLM 适配、视频下载、视频分析、FFmpeg、prompt 引擎与消毒。                                                                                                                                |
| `libs/oss`           | 阿里云 OSS 服务、STS 签发、key 生成。                                                                                                                                                                      |
| `libs/observability` | health 端点、logger、metrics（HTTP 拦截器与 metrics controller）。                                                                                                                                         |
| `libs/swagger`       | Swagger/OpenAPI 共享配置、JWT Bearer 鉴权、分页/内部 API 装饰器。                                                                                                                                          |

---

## 四、Nx 依赖图问题

基于各 `package.json` 的 `peerDependencies` 实际验证，当前依赖图存在以下结构问题：

```
common ──depends on──▶ database   （反向依赖：common 反向依赖 database）
temporal ──depends on──▶ ai, oss  （ai/oss 为 optional peer）
ai ──depends on──▶ common ──▶ database
swagger ──depends on──▶ common ──▶ database
workbench-service ──depends on──▶ common, database, observability, temporal, ai, swagger
```

### 4.1 关键问题：common → database 反向依赖

`libs/common` 的 `peerDependencies` 声明了对 `@reelclone/database` 的依赖，且 `libs/common/src/config/` 下存在 `database.config.ts` 与 `redis.config.ts`。

这意味着：

- 本应作为最底层通用工具库的 `common`，反而依赖了基础设施层 `database`。
- 任何引用 `common` 的模块（如 `ai`、`swagger`）都会传递性引入 `database`。
- 这违反了「通用库不依赖基础设施」的分层原则，是重构需要解决的核心结构问题之一。

### 4.2 传递依赖链

```
workbench-service
  ├── common ──▶ database
  ├── database
  ├── observability
  ├── temporal ──▶ ai ──▶ common ──▶ database
  │            └──▶ oss
  ├── ai ──▶ common ──▶ database
  └── swagger ──▶ common ──▶ database
```

---

## 五、当前运行事实（重要）

以下事实必须与目标架构严格区分：

### 5.1 当前不是 K8s 部署

- **当前运行事实**：生产部署使用 Docker Compose（`docker/docker-compose.prod.yml`），单机运行。
- **目标架构**：K8s 部署（见 `01-docs/03-技术架构方案.md`，属 TARGET，未实现）。
- 仓库中**不存在**任何 K8s manifest、Helm chart 或 Terraform 配置。

### 5.2 当前没有 Formance Ledger

- **当前运行事实**：使用自建 V2 reservation 模型（`libs/database/src/entities/credit-reservation.entity.ts` + `reelclone_main` 中的权威余额与 operation）。
- **目标架构**：Formance Ledger（见 `01-docs/03-技术架构方案.md`，属 TARGET，未引入）。
- billing-service 同时保留 legacy ledger 与 V2 reservation 两套路径。

### 5.3 当前没有 RabbitMQ

- **当前运行事实**：服务间同步通信通过 HTTP（axios），异步通过 Temporal 工作流；没有消息队列。
- **目标架构**：RabbitMQ（见 `01-docs/03-技术架构方案.md`，属 TARGET，未引入）。

### 5.4 当前入口是生产 Compose 中的 Nginx

- **当前运行事实**：生产入口是 `docker-compose.prod.yml` 中的 `nginx` 服务（`nginx:1.27-alpine`），配置见 `docker/nginx/nginx.conf`。
- Nginx 完成 SSL 终止、路径分发、限流（auth/sms/api 三级 limit_req_zone）、WebSocket 升级。
- **没有**独立 api-gateway 应用。

---

## 六、文档分层维护约定

- **本文档（CURRENT_ARCHITECTURE.md）** 是当前运行事实的**唯一权威**。
- `01-docs/03-技术架构方案.md` 已标记为 **TARGET 架构文档**，描述的是目标架构，不反映当前运行事实。
- 目标架构中的组件（K8s / Formance / RabbitMQ / Terraform）只有在达到明确规模与运维触发条件后，才会被重新评估引入。
- 任何结构性变更（新增/删除服务、数据库变更、依赖图变化、部署方式变更）合并后**必须更新本文档**。
