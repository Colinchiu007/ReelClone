# ReelClone

> **WouwouAI 微信小程序 1:1 复刻项目**
>
> ReelClone 是基于 Nx Monorepo 架构的全栈项目，目标是 1:1 复刻 WouwouAI 微信小程序的能力，涵盖 AI 视频/图片/文本生成、对标解析、套餐积分、订单支付、作品管理、推荐灵感广场、站内通知等核心功能。

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](.github/workflows/ci.yml)
[![Nx](https://img.shields.io/badge/Nx-19-blue)](nx.json)
[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)](package.json)

---

## 技术栈

| 领域 | 选型 |
| --- | --- |
| Monorepo | Nx |
| 语言 | TypeScript |
| 微信小程序 | Taro + React |
| 后端 | Node.js + NestJS |
| 数据库 | PostgreSQL |
| 缓存/队列 | Redis |
| 工作流引擎 | Temporal |
| 对象存储 | 阿里云 OSS |
| 视频 AI | Seedance（多 Key 轮询） |
| 大语言模型 | OpenAI 兼容协议 |
| 短信 | 阿里云 SMS |
| 支付 | 微信支付 V3 |
| API 文档 | Swagger / OpenAPI（`@reelclone/swagger`） |

---

## 项目结构

```
ReelClone/
├── apps/                              # 可部署应用
│   ├── auth-service/                  #   认证服务         (端口 3001)
│   ├── user-service/                  #   用户服务         (端口 3002)
│   ├── asset-service/                 #   资产服务         (端口 3003)
│   ├── benchmark-service/             #   对标解析服务     (端口 3004)
│   ├── template-service/              #   模板服务         (端口 3005)
│   ├── billing-service/               #   积分计费服务     (端口 3006)
│   ├── workbench-service/             #   创作工作台服务   (端口 3007)
│   ├── notification-service/          #   通知服务         (端口 3008)
│   ├── order-service/                 #   订单与支付服务   (端口 3009)
│   ├── media-worker/                  #   Temporal Worker  (端口 3010)
│   └── miniprogram/                   #   Taro 小程序前端
├── libs/                              # 共享库
│   ├── common/                        #   @reelclone/common      通用工具与类型
│   ├── database/                      #   @reelclone/database    数据访问层
│   ├── ai/                            #   @reelclone/ai          AI 能力封装
│   ├── temporal/                      #   @reelclone/temporal    工作流
│   ├── oss/                           #   @reelclone/oss         对象存储
│   └── swagger/                       #   @reelclone/swagger     Swagger/OpenAPI 配置
├── docker/                            # Docker 编排配置（docker-compose.yml）
├── docs/                              # 工程文档
│   └── API.md                         #   完整 API 端点文档
├── 01-docs/                           # 产品与技术文档（PRD、架构、数据模型等）
├── tools/                             # 工具脚本
├── scripts/                           # 运维脚本
├── .github/                           # CI/CD 流水线
├── .husky/                            # Git 钩子
├── package.json
├── nx.json
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── commitlint.config.js
└── .env.example
```

---

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9（或 pnpm / yarn）
- Docker >= 20（用于本地基础设施）

### 5 步启动

```bash
# 1. 克隆仓库
git clone <repo-url> ReelClone
cd ReelClone

# 2. 安装依赖（注意 --legacy-peer-deps 避免 NestJS peerDeps 冲突）
npm install --legacy-peer-deps

# 3. 启动基础设施（PostgreSQL + Redis + Temporal）
npm run docker:up

# 4. 执行数据库迁移
npm run migration:run

# 5. 启动开发服务（任选其一）
npx nx serve auth-service        # 单服务启动
npx nx run-many --target=serve --all   # 全部启动
```

### 配置环境变量

```bash
cp .env.example .env
# 按需修改 .env 中的配置项（数据库密码、JWT 密钥、微信 AppID、OSS、AI Key 等）
```

各微服务的 `.env.example` 位于 `apps/<service>/.env.example`，可参考填写。

---

## 开发指南

### Monorepo 结构说明

- **apps/**：可部署应用，每个目录是一个独立的 NestJS 微服务 / Taro 小程序 / Temporal Worker。
- **libs/**：跨服务共享代码，通过 `@reelclone/<lib>` 路径别名引入（配置在 `tsconfig.base.json`）。
- 所有微服务共享统一的基础设施：全局响应拦截器、异常过滤器、JWT 守卫、ValidationPipe（来自 `@reelclone/common`）。
- 数据库实体与迁移由 `@reelclone/database` 统一管理，按连接分目录（main / billing / template / benchmark）。

### Nx 常用命令

```bash
# 查看所有项目
npx nx show projects

# 单项目操作
npx nx lint auth-service          # 单服务 lint
npx nx typecheck auth-service     # 单服务类型检查
npx nx test auth-service          # 单服务单元测试
npx nx build auth-service         # 单服务构建
npx nx serve auth-service         # 单服务热重载启动

# 全量操作（受影响项目）
npx nx run-many --target=lint --all --parallel
npx nx run-many --target=build --all
npx nx affected --target=test     # 仅测试受影响项目
```

### 根级脚本

```bash
npm run bootstrap         # 安装所有工作区依赖
npm run docker:up         # 启动基础设施
npm run docker:down       # 停止基础设施
npm run lint              # 全量 lint
npm run typecheck         # 全量类型检查
npm run test:unit         # 全量单元测试
npm run test:integration  # 全量集成测试
npm run build             # 全量构建
npm run migration:run     # 执行数据库迁移
npm run migration:generate # 生成数据库迁移
```

### 代码规范

- **ESLint**：`.eslintrc.js`，统一规则覆盖所有工作区
- **Prettier**：`.prettierrc`，无分号、单引号、2 空格缩进、尾逗号 `all`
- **Commitlint**：`commitlint.config.js`，遵循 [约定式提交](https://www.conventionalcommits.org/zh-hans/) 规范
- **lint-staged**：`.lintstagedrc.json`，提交前自动 lint 与格式化暂存文件
- **Husky**：`pre-commit` + `commit-msg` 钩子

支持的提交类型：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`

示例：

```
feat(video): 新增图生视频首尾帧能力
fix(pay): 修复微信支付回调签名校验失败
docs(api): 补充套餐积分接口文档
```

### 分支策略

- `main`：生产分支，受保护，仅通过 PR 合入
- `develop`：开发主分支，日常集成
- `feature/<scope>-<desc>`：功能分支（如 `feature/billing-freeze`）
- `fix/<scope>-<desc>`：修复分支
- `release/<version>`：发布分支

---

## 微服务清单

### 9 个后端微服务 + 1 个 Worker + 1 个小程序

| 服务 | 路径 | 端口 | 路由前缀 | 职责 |
| --- | --- | --- | --- | --- |
| auth-service | apps/auth-service | 3001 | `/api/v1/auth` | 微信登录、JWT Token 刷新、登出（黑名单） |
| user-service | apps/user-service | 3002 | `/api/v1/users`、`/api/v1/sms` | 用户信息、绑定手机号、修改密码、短信验证码 |
| asset-service | apps/asset-service | 3003 | `/api/v1/assets`、`/api/v1/avatar-groups` | 素材资产、真人形象组、OSS 直传凭证 |
| benchmark-service | apps/benchmark-service | 3004 | `/api/v1/benchmarks` | 竞品视频对标解析 |
| template-service | apps/template-service | 3005 | `/api/v1/templates`、`/api/v1/users/industry-preferences` | 模板广场、收藏、行业偏好 |
| billing-service | apps/billing-service | 3006 | `/api/v1/points` | 积分余额、流水、冻结/结算/释放/赠送 |
| workbench-service | apps/workbench-service | 3007 | `/api/v1/generations`、`/api/v1/works` | AI 生成任务、作品管理 |
| notification-service | apps/notification-service | 3008 | `/api/v1/notifications` | 站内通知、WebSocket 推送、微信订阅消息 |
| order-service | apps/order-service | 3009 | `/api/v1/orders`、`/api/v1/packages`、`/api/v1/webhooks/wechat-pay` | 套餐、订单、微信支付 |
| media-worker | apps/media-worker | 3010 | — | Temporal Worker（执行视频生成工作流） |
| miniprogram | apps/miniprogram | — | — | Taro 微信小程序前端 |

### 端口分配表

| 端口 | 用途 |
| --- | --- |
| 3001–3009 | 9 个后端微服务 |
| 3010 | media-worker（Temporal Worker） |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 7233 | Temporal Server（gRPC） |
| 8233 | Temporal Web UI |

### Mock 模式说明

为降低本地开发门槛，所有第三方依赖均支持 Mock 模式（环境变量 `*_MOCK_MODE=true`）：

| Mock | 环境变量 | 行为 |
| --- | --- | --- |
| 微信登录 | `WECHAT_MOCK_MODE=true` | 任意 code 返回固定 openid |
| 短信 | `SMS_MOCK_MODE=true` | 不真实发送，响应中返回 `mockCode` |
| AI 视频 | `SEEDANCE_MOCK_MODE=true` | 返回占位视频，不消耗真实积分额度 |
| 微信支付 | `WECHAT_PAY_MOCK_MODE=true` | 跳过签名校验，直接置为已支付 |
| OSS | `OSS_MOCK_MODE=true` | 使用本地文件系统替代阿里云 OSS |

> 默认 `.env.example` 中 Mock 模式均开启，开箱即用。生产部署时务必关闭并填入真实凭证。

---

## 部署指南

详细的部署流程见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)（如未创建请参考 `01-docs/04-开发运维计划.md`）。

要点：

1. 每个微服务有独立的 `Dockerfile`（位于 `apps/<service>/Dockerfile`）
2. `docker/docker-compose.yml` 提供本地基础设施编排
3. CI/CD 流水线定义在 `.github/workflows/`（`ci.yml` + `pr.yml`）
4. 数据库迁移通过 `npm run migration:run` 在容器启动前执行

---

## 测试

```bash
# 单元测试（全量）
npm run test:unit

# 集成测试（全量）
npm run test:integration

# 单服务测试
npx nx test auth-service

# 测试覆盖率
npx nx test auth-service --coverage
```

测试文件命名约定：`*.spec.ts`（单元）/ `*.test.ts`（集成）。
测试用例集详见 [`01-docs/08-测试用例集.md`](01-docs/08-测试用例集.md)。

---

## API 文档

- **完整端点清单**：[`docs/API.md`](docs/API.md)
- **Swagger UI**：开发环境下访问各服务的 `http://localhost:<PORT>/api/docs`
- **OpenAPI JSON**：`http://localhost:<PORT>/api/docs-json`

Swagger 配置由 `@reelclone/swagger` 共享库统一提供，各微服务在 `main.ts` 中通过 `createSwaggerConfig` + `setupSwagger` 挂载。

---

## 项目文档清单

`01-docs/` 下的完整产品与技术文档：

| 文档 | 说明 |
| --- | --- |
| [`01-完整功能点列表和说明.md`](01-docs/01-完整功能点列表和说明.md) | WouwouAI 全部功能点拆解 |
| [`02-产品PRD文档.md`](01-docs/02-产品PRD文档.md) | 产品需求文档 |
| [`03-技术架构方案.md`](01-docs/03-技术架构方案.md) | 技术选型与架构设计 |
| [`04-开发运维计划.md`](01-docs/04-开发运维计划.md) | 开发排期与运维方案 |
| [`05-截图视觉审计报告.md`](01-docs/05-截图视觉审计报告.md) | 视觉还原度审计 |
| [`06-截图操作流程映射.md`](01-docs/06-截图操作流程映射.md) | 截图与功能流程映射 |
| [`07-数据模型设计.md`](01-docs/07-数据模型设计.md) | 数据库表结构设计 |
| [`08-测试用例集.md`](01-docs/08-测试用例集.md) | 测试用例 |
| [`09-项目架构分析与开发计划报告.md`](01-docs/09-项目架构分析与开发计划报告.md) | 架构分析与计划报告 |

`docs/` 下的工程文档：

| 文档 | 说明 |
| --- | --- |
| [`docs/API.md`](docs/API.md) | 完整 API 端点文档（按服务分组） |
| [`CHANGELOG.md`](CHANGELOG.md) | 变更日志 |

---

## License

UNLICENSED
