# ReelClone MVP 全栈构建 Spec

## Why

ReelClone 是 WouwouAI 微信小程序的 1:1 复刻项目。目前已完成 9 份设计文档（功能点列表、PRD、技术架构、数据模型、测试用例等），但项目代码尚未启动。本 Spec 启动项目从 0 到 1 的全栈构建，先打通 MVP 关键路径（微信登录→浏览→生成→支付），再迭代扩展到完整版。

遵循质量节拍"煮沸湖泊，标记海洋"原则：完整实现 MVP 闭环，而非半完成全功能。最终交付物是微信小程序，所有架构决策以小程序为锚点。

## What Changes

### 新增：项目基础设施
- 建立 Nx Monorepo 工作区（apps/ + libs/ + tools/）
- 配置 TypeScript 5.x、ESLint、Prettier、Husky、Commitlint
- 配置 Docker Compose 本地开发环境（PostgreSQL 16、Redis 7）
- 配置 CI/CD 流水线（GitHub Actions：lint→test→build）
- 配置环境变量管理（.env.example + @nestjs/config）

### 新增：微信小程序前端（Taro 3.x + React + Zustand）
- **BREAKING**: 无现有前端，全新创建
- 深色主题设计系统（蓝紫渐变 #4F46E5 ~ #7C3AED）
- 主包 4 个 TabBar 页面：首页、推荐、对标解析、我的
- 4 个分包：workbench（生成工作台）、asset（资产）、billing（计费）、settings（设置）
- 八宫格渐变 SVG 图标组件
- 请求管理器（并发限制 8、Token 拦截、错误统一处理）
- WebSocket 任务进度推送
- OSS 直传上传

### 新增：后端微服务集群（NestJS + TypeScript）
- **BREAKING**: 无现有后端，全新创建
- 共享库：common（DTO/拦截器/过滤器/守卫）、database（TypeORM 实体/迁移）、ai（Seedance/LLM 适配器）、temporal（工作流）
- 9 个微服务：auth、user、asset、workbench、benchmark、template、billing、order、notification
- API 网关层：Nginx Ingress + JWT 鉴权
- Temporal 工作流引擎集成（视频生成异步编排）

### 新增：数据持久层
- PostgreSQL 16：4 库分库（main/billing/template/benchmark）
- Redis 7：缓存、会话、限流、分布式锁
- 阿里云 OSS：素材/成品/封面存储（STS Token 直传）
- TypeORM 迁移：13 个核心实体

### 新增：AI 能力集成层
- Seedance Provider 适配器（多 Key 轮询、故障切换）
- LLM 适配器（提示词引擎、文案生成）
- 视频下载器（lux + yt-dlp 双适配，5 平台支持）
- 视频分析器（PySceneDetect + FunASR + PaddleOCR + Qwen3-VL）
- **MVP 阶段使用 Mock Provider**，真实 API Key 配置后切换

### 新增：核心业务流程
- 微信登录流（wx.login + code2session + JWT 签发）
- 手机号绑定流（短信验证码）
- 素材上传流（OSS STS + 直传 + 元数据落库）
- 生成任务流（提交→冻结积分→Temporal 编排→结算/退款→WebSocket 推送）
- 对标解析流（下载→拆解→LLM 汇总→报告展示）
- 套餐购买流（订单→微信支付→回调幂等→积分到账）
- 模板浏览流（灵感广场→收藏→一键套用）

### 新增：可观测性与运维
- 结构化日志（Pino + Loki）
- 指标监控（Prometheus + Grafana）
- 分布式追踪（OpenTelemetry + Jaeger）
- 健康检查端点
- K8s 部署清单（Helm Chart）

## Impact

- Affected specs: 全新项目，无既有 spec
- Affected code: 全新代码库（无既有代码）
- 依赖文档：
  - [01-完整功能点列表和说明.md](../../01-docs/01-完整功能点列表和说明.md) — 129 个 FR
  - [02-产品PRD文档.md](../../01-docs/02-产品PRD文档.md) — 需求/非需求
  - [03-技术架构方案.md](../../01-docs/03-技术架构方案.md) — 架构选型
  - [07-数据模型设计.md](../../01-docs/07-数据模型设计.md) — 13 个实体
  - [09-项目架构分析与开发计划报告.md](../../01-docs/09-项目架构分析与开发计划报告.md) — 完整架构

## ADDED Requirements

### Requirement: Monorepo 基础设施
系统 SHALL 提供基于 Nx 的 Monorepo 工作区，统一管理前端、后端、共享库、工具脚本。

#### Scenario: 开发者克隆仓库后一键启动
- **WHEN** 开发者执行 `npm install && npm run bootstrap`
- **THEN** 所有依赖安装完成
- **AND** Docker Compose 启动 PostgreSQL + Redis
- **AND** 数据库迁移自动执行
- **AND** 至少 auth-service 可成功启动并响应健康检查

#### Scenario: CI 流水线触发
- **WHEN** 开发者推送代码到任意分支
- **THEN** GitHub Actions 自动执行 lint、typecheck、unit test、build
- **AND** 任一环节失败则流水线失败

### Requirement: 微信小程序深色主题
系统 SHALL 提供与 WouwouAI 截图一致的深色主题界面，使用蓝紫渐变作为品牌色。

#### Scenario: 用户首次打开小程序
- **WHEN** 用户启动小程序进入首页
- **THEN** 页面背景为 #0F0F1A
- **AND** 八宫格入口使用彩色渐变 SVG 图标
- **AND** TabBar 显示 4 个标签：首页、推荐、对标解析、我的
- **AND** TabBar 选中色为 #7C3AED

### Requirement: 微信登录流
系统 SHALL 支持用户通过微信一键登录，签发 JWT Token 用于后续 API 调用。

#### Scenario: 首次微信登录
- **WHEN** 用户在小程序中调用 `wx.login` 获取 code
- **AND** 提交 code 到 `/api/v1/auth/wechat-login`
- **THEN** 后端调用 `code2session` 换取 openid + session_key
- **AND** 创建用户记录（若不存在）
- **AND** 签发 JWT Token（2h 有效）+ Refresh Token（7d 有效）
- **AND** 返回用户信息和 Token

#### Scenario: Token 过期自动刷新
- **WHEN** 请求返回 401
- **THEN** 小程序自动调用 `/api/v1/auth/refresh-token`
- **AND** 使用 Refresh Token 换取新的 Access Token
- **AND** 重试原请求

### Requirement: 生成任务全流程
系统 SHALL 支持用户提交生成任务（文本/图片/视频），通过 Temporal 工作流异步编排，完成后通过 WebSocket 推送结果。

#### Scenario: 视频生成成功
- **WHEN** 用户提交文生视频任务并扣减积分成功
- **THEN** workbench-service 创建 Work 记录（状态 PENDING）
- **AND** 启动 Temporal 工作流
- **AND** 工作流调用 Seedance Provider 提交任务
- **AND** 轮询任务状态直到 COMPLETED
- **AND** FFmpeg 后处理（转码、封面、压缩）
- **AND** 结算积分（实际用量）
- **AND** 通过 WebSocket 推送 COMPLETED 事件
- **AND** Work 状态更新为 COMPLETED

#### Scenario: 生成任务失败退款
- **WHEN** Seedance 任务返回 FAILED 或超时
- **THEN** 工作流释放冻结积分
- **AND** Work 状态更新为 FAILED
- **AND** 通过 WebSocket 推送 FAILED 事件
- **AND** 错误信息记录到 Work.errorLog

### Requirement: 积分计费幂等性
系统 SHALL 保证积分扣减/结算/退款操作的幂等性，使用 Formance Ledger 进行原子复式记账。

#### Scenario: 重复提交任务不重复扣分
- **WHEN** 用户快速重复点击"生成"按钮
- **THEN** 前端通过防抖 + 幂等键拦截重复请求
- **AND** 后端通过 `(userId, idempotencyKey)` 唯一约束拒绝重复提交
- **AND** 仅第一次请求成功扣减积分

#### Scenario: 任务失败自动退款
- **WHEN** 生成任务失败
- **THEN** billing-service 调用 Ledger 将 reserved 账户金额转回 available
- **AND** 退款操作幂等（同一 workId 仅退款一次）

### Requirement: 微信支付集成
系统 SHALL 支持用户通过微信支付购买套餐，支付回调幂等处理。

#### Scenario: 套餐购买成功
- **WHEN** 用户选择套餐并点击"立即购买"
- **THEN** order-service 创建订单（状态 PENDING）
- **AND** 调用微信支付统一下单 API
- **AND** 返回支付参数给小程序
- **AND** 小程序调起 `wx.requestPayment`

#### Scenario: 支付回调幂等
- **WHEN** 微信支付回调到达 `/api/v1/webhooks/wechat-pay`
- **THEN** 验证签名
- **AND** 通过 `out_trade_no` 幂等检查（已处理则直接返回 SUCCESS）
- **AND** 更新订单状态为 PAID
- **AND** 调用 billing-service 增加用户积分
- **AND** 通过订阅消息通知用户

### Requirement: 素材上传流
系统 SHALL 支持用户通过 OSS 直传上传素材，绕过小程序 100MB 限制。

#### Scenario: 上传图片素材
- **WHEN** 用户选择图片并调用上传
- **THEN** 前端请求 `/api/v1/assets/upload-token` 获取 STS Token
- **AND** 使用 `wx.uploadFile` 直传 OSS
- **AND** 上传成功后调用 `/api/v1/assets` 创建资产记录
- **AND** 资产出现在素材库列表

### Requirement: 对标解析流
系统 SHALL 支持用户粘贴竞品视频链接，自动下载并拆解为结构化报告。

#### Scenario: 抖音链接解析
- **WHEN** 用户粘贴抖音分享链接并提交
- **THEN** benchmark-service 创建 Benchmark 记录（状态 PENDING）
- **AND** 启动 Temporal 工作流
- **AND** 工作流调用视频下载器（lux 优先，yt-dlp 兜底）
- **AND** 并行执行：场景切分、语音识别、OCR、画面描述
- **AND** LLM 汇总为结构化报告（风格/镜头/文案/卖点）
- **AND** 通过 WebSocket 推送完成事件

### Requirement: 模板灵感广场
系统 SHALL 提供按行业/平台/热度聚合的模板广场，用户可收藏和一键套用。

#### Scenario: 浏览灵感广场
- **WHEN** 用户进入灵感广场
- **THEN** 首次弹出行业偏好绑定弹窗
- **AND** 选择行业后展示对应模板卡片瀑布流
- **AND** 每张卡片显示封面、标题、热度、使用人数

#### Scenario: 收藏模板
- **WHEN** 用户点击模板卡片的收藏按钮
- **THEN** 调用 `/api/v1/templates/:id/favorite`
- **AND** 收藏状态实时更新
- **AND** 模板出现在"我的模板"页面

### Requirement: WebSocket 任务进度推送
系统 SHALL 通过 WebSocket 实时推送任务进度，订阅消息作为离线兜底。

#### Scenario: 任务进行中实时推送
- **WHEN** 用户提交任务后停留在任务详情页
- **THEN** 建立 WebSocket 连接 `/ws/tasks/:taskId/progress`
- **AND** 后端在任务状态变更时推送事件
- **AND** 前端实时更新进度条和状态文字
- **AND** 任务完成或失败时关闭连接

#### Scenario: 离线兜底
- **WHEN** 用户关闭小程序或切换后台
- **AND** 任务完成
- **THEN** 通过微信订阅消息通知用户
- **AND** 用户重新打开小程序时可在"我的作品"查看结果

### Requirement: 真人形象资产管理
系统 SHALL 提供真人形象资产组管理，包含授权链路和级联删除。

#### Scenario: 创建真人形象组
- **WHEN** 用户在"我的资产"点击"新建真人形象组"
- **THEN** 弹窗要求输入组名并上传授权书
- **AND** 创建 AvatarGroup 记录（状态 ACTIVE）
- **AND** 授权书文件存入 OSS

#### Scenario: 删除真人形象组级联
- **WHEN** 用户删除真人形象组
- **THEN** 组内所有素材标记为 DELETED
- **AND** 关联的待执行生成任务取消
- **AND** 已完成作品保留但标记"来源已删除"

### Requirement: 内容安全审核
系统 SHALL 对所有 UGC 内容和 AI 生成结果进行内容安全审核。

#### Scenario: 生成结果审核
- **WHEN** 视频生成完成
- **THEN** 调用内容安全 API 审核视频和封面
- **AND** 审核通过则作品状态为 COMPLETED
- **AND** 审核不通过则作品状态为 REJECTED 并退款
- **AND** 记录审核结果到 Work.moderationResult

### Requirement: 可观测性
系统 SHALL 提供完整的日志、指标、追踪能力。

#### Scenario: 排查线上问题
- **WHEN** 运维收到告警
- **THEN** 通过 traceId 在 Jaeger 中查看完整调用链
- **AND** 通过 Loki 查看相关日志
- **AND** 通过 Grafana 查看相关指标
- **AND** 三者通过 traceId 关联

## Scope Boundaries（明确不做）

### MVP 阶段不做（标记为 Ocean）
- 3D 建模（TRELLIS 集成）— 留待完整版
- 推荐算法（Gorse）— MVP 用热门排序
- 管理后台（Payload CMS）— MVP 用 SQL 直接管理
- K8s 生产部署 — MVP 用 Docker Compose
- 多 Agent 并行开发 — 单 Agent 串行
- 视觉回归测试基线 — 后续 Sprint 补充
- 灰度发布 — MVP 直接发布

### 真实 API 集成策略
- Seedance API：MVP 用 Mock Provider（返回模拟视频），配置 Key 后切换
- LLM API：MVP 用 Mock（返回模板文案），配置 Key 后切换
- 视频下载：MVP 用 Mock（返回示例视频），配置 Key 后切换
- 微信支付：MVP 用沙箱环境
- 内容安全：MVP 用本地关键词过滤，生产切换云服务
