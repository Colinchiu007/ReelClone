# 变更日志

本项目所有重要变更均记录于此文档。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.1.0] - 2026-07-29

### MVP 完成

ReelClone 首个里程碑版本：完成 WouwouAI 微信小程序 1:1 复刻的 MVP，覆盖认证、用户、资产、对标解析、模板、积分计费、创作工作台、通知、订单支付 9 大业务域，以及 Taro 小程序前端 30+ 页面。

---

### 新增

#### 后端微服务（9 个）

- **auth-service**（端口 3001）：微信小程序登录（code2session）、JWT Token 签发与刷新、登出（Token 黑名单 via Redis）
- **user-service**（端口 3002）：用户信息查询与更新、绑定手机号、修改密码、阿里云短信验证码
- **asset-service**（端口 3003）：素材资产（图片/视频/音频）CRUD、真人形象组管理、OSS STS 直传凭证签发
- **benchmark-service**（端口 3004）：竞品视频对标解析（抖音/小红书/B站/快手/微博/视频号），通过 Temporal 工作流编排下载→分析→LLM 提炼
- **template-service**（端口 3005）：模板广场（公开）、模板收藏、行业偏好设置（20 个行业标签）
- **billing-service**（端口 3006）：积分余额查询、流水查询、积分冻结/结算/释放/赠送（内部 API，幂等保证）
- **workbench-service**（端口 3007）：AI 生成任务（8 种类型：文生视频/图生视频首帧/首尾帧/3D 建模/编辑视频/延长视频/文本生成/图片生成）、作品管理、积分冻结联动
- **notification-service**（端口 3008）：站内通知查询/未读计数/标记已读、WebSocket 实时推送、微信订阅消息
- **order-service**（端口 3009）：套餐查询（公开）、订单创建/查询/取消、微信支付 V3 下单与回调处理

#### Worker

- **media-worker**（端口 3010）：Temporal Worker，执行视频生成、对标解析等工作流 Activity

#### 共享库（6 个）

- **@reelclone/common**：统一响应拦截器、全局异常过滤器、JWT 守卫、限流守卫、ValidationPipe、错误码枚举、工具函数（幂等键/追踪 ID/日期）、配置工厂
- **@reelclone/database**：TypeORM 多连接配置（main/billing/template/benchmark 4 个 PostgreSQL 库）、SnakeNamingStrategy、14 个实体、4 套初始化迁移、Redis 模块
- **@reelclone/ai**：视频下载器、FFmpeg 服务、视频分析器、LLM Provider（OpenAI 兼容）、Prompt 引擎、内容审核、Seedance Provider（多 Key 轮询）
- **@reelclone/temporal**：Temporal Client/Worker、视频生成工作流、对标解析工作流、6 类 Activity（媒体/分析/计费/通知/OSS/Seedance）
- **@reelclone/oss**：阿里云 OSS 上传/下载/签名 URL、STS Token 签发、小程序直传凭证、Key 生成器
- **@reelclone/swagger**：Swagger/OpenAPI 共享配置库，DocumentBuilder 工厂、JWT Bearer 鉴权方案、分页响应装饰器、内部 API 装饰器

#### Taro 小程序前端

- **30+ 页面**：首页、工作台（文生视频/图生视频首帧/首尾帧/3D 建模/编辑视频/延长视频/文本生成/图片生成/作品详情/作品列表）、对标解析、推荐灵感广场、模板广场/详情/我的模板、个人中心、设置（关于/隐私/绑定手机号/修改密码）、我的资产（普通资产/真人形象组/上传弹窗/新建形象组）、我的作品、套餐与积分（订阅/我的套餐/消费记录/我的订单）
- **9 个全局组件库**：CreditBadge（积分徽章）、GradientIcon（渐变图标）、IndustryPicker（行业选择器）、MediaUploader（媒体上传器）、PromptInput（提示词输入）、QuickCreate（快捷创作菜单）、StateComponents（状态组件：空/加载/错误）、TemplateCard（模板卡片）、WorkCard（作品卡片）
- **完整请求层**：基于 Taro.request 封装的统一请求拦截器、Token 管理、9 个业务 API 模块（auth/user/asset/benchmark/billing/notification/order/template/workbench）、上传服务
- **状态管理**：auth.store（登录态）、notification.store（通知未读数）、points.store（积分余额）
- **Hooks**：useAuth、useCredits、useUpload、useWebSocket

#### 基础设施

- **Docker 部署配置**：`docker/docker-compose.yml`（PostgreSQL + Redis + Temporal）、`docker/init-db.sql`（4 个数据库初始化）、每个微服务独立 `Dockerfile`
- **CI/CD 流水线**：`.github/workflows/ci.yml`（主分支 CI）、`.github/workflows/pr.yml`（PR 检查）、PR 模板
- **Git 规范**：Husky pre-commit + commit-msg 钩子、lint-staged、commitlint（约定式提交）、ESLint + Prettier
- **API 文档**：`docs/API.md` 完整端点清单（9 服务 50+ 端点）、Swagger UI 各服务挂载于 `/api/docs`

#### 项目文档（01-docs/）

- `01-完整功能点列表和说明.md`：WouwouAI 全部功能点拆解
- `02-产品PRD文档.md`：产品需求文档
- `03-技术架构方案.md`：技术选型与架构设计
- `04-开发运维计划.md`：开发排期与运维方案
- `05-截图视觉审计报告.md`：视觉还原度审计
- `06-截图操作流程映射.md`：截图与功能流程映射
- `07-数据模型设计.md`：数据库表结构设计
- `08-测试用例集.md`：测试用例
- `09-项目架构分析与开发计划报告.md`：架构分析与计划报告

---

### 关键设计决策

- **Monorepo + Nx**：所有微服务与共享库统一在一个仓库，通过 `@reelclone/<lib>` 路径别名共享代码，保证基础设施一致性
- **统一响应包装**：全局 `ResponseInterceptor` 将所有返回值包装为 `{ code, message, data, traceId }`，错误码 0 表示成功
- **多数据库连接**：按业务域拆分为 4 个 PostgreSQL 库（main/billing/template/benchmark），通过 `DATABASE_CONNECTIONS` Token 注入对应 Repository
- **JWT + 黑名单**：Access Token 短期（1h）+ Refresh Token 长期（7d），登出通过 Redis 黑名单实现即时失效
- **Temporal 工作流**：长耗时任务（视频生成、对标解析）通过 Temporal 编排，支持重试、补偿、取消
- **积分冻结-结算模式**：任务提交时冻结预估积分，成功后结算实际消耗，失败/取消时释放，避免并发超扣
- **内部 API 鉴权**：微服务间调用通过 `x-api-key` Header + `InternalApiKeyGuard`，与对外 JWT 鉴权隔离
- **Mock 模式**：所有第三方依赖（微信/短信/AI/支付/OSS）支持 Mock，开箱即用，降低本地开发门槛

---

[0.1.0]: https://github.com/reelclone/reelclone/releases/tag/v0.1.0
