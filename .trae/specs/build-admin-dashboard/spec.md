# 运营后台（Admin Dashboard）Spec

## Why

ReelClone 当前完全没有运营后台：无 admin 应用、无 RBAC、无 User.role 字段。更严重的是，已有的两个"类运营"接口（模板审核、形象组授权审核）存在**权限漏洞** — 任何登录用户都能审核模板或自审授权状态。运营人员无法通过任何界面执行用户管理、内容审核、数据统计、套餐管理、订单退款等日常运营操作。

本 Spec 补全运营后台能力：新增 `admin-service`（NestJS）+ `admin-web`（React），实现 RBAC 基础设施 + 核心运营功能。

## What Changes

### 基础设施（P0 必需）

- **新增** User 实体 `role` 字段（`USER / ADMIN / SUPER_ADMIN`）+ 数据库迁移
- **修改** JWT payload 携带 `role` + JwtStrategy 填充 role
- **新增** `RolesGuard` + `@Roles('ADMIN')` 装饰器（libs/common）
- **新增** `POST /api/v1/auth/admin-login` 账号密码登录端点（管理员不走微信登录）
- **修复** template-service 审核接口权限漏洞 — 加 `@Roles('ADMIN')` 守卫
- **修复** avatar-group 授权审核 — 拆分为管理员专属端点

### 后端 admin-service（NestJS，端口 3011）

- **新增** `apps/admin-service` — 独立微服务，复用 @reelclone/common + @reelclone/database
- 用户管理：列表/详情/封禁/解封/角色变更/人工调账
- 内容管理：作品列表/强制下架/模板全状态管理
- 审核工作台：模板审核 + 形象组授权审核（统一入口）
- 套餐管理：CRUD + 上下架
- 订单管理：全平台查询/退款
- 数据统计：概览看板（DAU/新增/GMV/生成量）+ 积分流水聚合
- 对账监控：触发对账 + 不一致记录查看
- 通知推送：系统公告广播 + 定向推送
- **API Key 管理**：运行时配置 Seedance/LLM/OSS Key（热刷新）

### 前端 admin-web（React + Ant Design Pro）

- **新增** `apps/admin-web` — React 18 + Ant Design Pro 5 + Vite
- Dashboard 看板（实时指标 + 趋势图）
- 用户管理（搜索/详情/封禁/调账/角色变更）
- 审核工作台（模板审核 + 形象组授权审核，统一待办列表）
- 内容管理（作品列表/强制下架/模板管理）
- 套餐管理（CRUD + 排序 + 上下架）
- 订单管理（查询/退款/状态回滚）
- 积分流水查询（跨用户/跨时间窗口）
- 对账监控（不一致告警 + 手动触发）
- 通知中心（公告编辑 + 推送范围选择）
- 系统配置（API Key 管理 + 环境变量查看）

## Impact

- Affected specs: `build-reelclone-mvp`（Task 13 benchmark-service + Task 23 workbench）、`implement-video-clone`（一键复刻功能验证）
- Affected code:
  - `libs/database/src/entities/user.entity.ts` — 新增 role 字段
  - `libs/database/src/migrations/main/0003_add_user_role.ts` — 新增迁移
  - `apps/auth-service/src/auth/jwt.service.ts` — JWT payload 加 role
  - `apps/auth-service/src/auth/jwt.strategy.ts` — validate 填充 role
  - `libs/common/src/guards/roles.guard.ts` — 新增 RolesGuard
  - `libs/common/src/decorators/roles.decorator.ts` — 新增 @Roles
  - `apps/auth-service/src/auth/auth.controller.ts` — 新增 admin-login
  - `apps/template-service/src/template/template.controller.ts` — 修复权限漏洞
  - `apps/asset-service/src/asset/avatar-group.controller.ts` — 拆分审核端点
  - `apps/admin-service/` — 新增完整服务
  - `apps/admin-web/` — 新增完整前端

## 运营需求头脑风暴与分析

### 运营角色画像

| 角色           | 核心职责                            | 高频操作                 |
| -------------- | ----------------------------------- | ------------------------ |
| **内容审核员** | 审核 UGC 模板、形象组授权、违规内容 | 审核工作台、强制下架     |
| **用户运营**   | 用户管理、积分调账、封禁/解封       | 用户列表、调账、通知推送 |
| **商品运营**   | 套餐管理、订单处理、退款            | 套餐 CRUD、订单查询      |
| **数据分析师** | 数据看板、对账监控、趋势分析        | Dashboard、对账报告      |
| **系统管理员** | API Key 管理、角色权限、系统配置    | 系统配置、角色管理       |

### 运营场景分析

#### 场景 1：UGC 模板审核（高频）

用户上传模板 → 进入待审核队列 → 审核员预览视频/封面 → 通过或拒绝（附备注）→ 用户收到通知

**痛点**：当前模板审核接口任何用户都能调用，且无管理界面

#### 场景 2：违规内容处置（中频）

用户举报/系统检测到违规作品 → 审核员查看作品 → 强制下架 → 通知创作者 → 记录处置日志

**痛点**：完全缺失，无下架接口、无处置日志

#### 场景 3：用户积分纠纷（低频但重要）

用户反馈积分扣减异常 → 运营查积分流水 → 确认异常 → 人工调账（赠送积分）→ 记录调账日志

**痛点**：无管理员调账接口（仅有内部 API）、无流水查询界面

#### 场景 4：套餐上下架（中频）

运营创建新套餐 → 配置积分/价格/赠送 → 上架 → 用户可购买 → 下架后不可购买但已购不影响

**痛点**：完全缺失，套餐只能通过数据库直接操作

#### 场景 5：订单退款（低频但关键）

用户反馈扣款未交付/重复扣款 → 运营查订单 → 确认退款 → 退还积分 + 微信退款 → 订单状态回滚

**痛点**：完全缺失，无退款接口

#### 场景 6：API Key 轮换（低频但必需）

Seedance Key 过期/泄露 → 系统管理员在后台更新 Key → 服务热刷新 → 无需重启

**痛点**：当前只能改 .env + 重启，无运行时配置能力

#### 场景 7：数据看板（高频）

管理层查看日活/新增/GMV/生成量 → 趋势图 → 导出报表

**痛点**：完全缺失，无任何统计接口

### 功能优先级

| 优先级 | 模块                       | 理由                                    |
| ------ | -------------------------- | --------------------------------------- |
| **P0** | RBAC 基础设施              | 安全基线 — 不加权限所有运营功能都无意义 |
| **P0** | 审核工作台（模板+形象组）  | 已有后端接口但有权限漏洞，需紧急修复    |
| **P0** | 用户管理（列表/封禁/调账） | 运营基础能力                            |
| **P1** | Dashboard 看板             | 数据驱动决策                            |
| **P1** | 内容管理（作品下架）       | 合规要求                                |
| **P1** | 套餐管理                   | 商品运营基础                            |
| **P1** | 订单管理（退款）           | 用户客诉处理                            |
| **P2** | 对账监控                   | 已有后端逻辑，仅需暴露接口              |
| **P2** | 通知推送                   | 运营触达                                |
| **P2** | API Key 管理               | 运维便利性                              |
| **P2** | 角色权限管理               | 多角色协作                              |

## ADDED Requirements

### Requirement: RBAC 基础设施

系统 SHALL 提供基于角色的访问控制（RBAC）能力。

#### Scenario: 管理员账号密码登录

- **WHEN** 管理员在 admin-web 登录页输入用户名和密码
- **THEN** 系统调用 `POST /api/v1/auth/admin-login`
- **AND** 后端校验 credentials + role 为 ADMIN 或 SUPER_ADMIN
- **AND** 返回 JWT（payload 含 role 字段）
- **AND** admin-web 存储 token 并跳转到 Dashboard

#### Scenario: 普通用户访问管理端点被拒

- **WHEN** role=USER 的 JWT 请求 `/admin/*` 端点
- **THEN** RolesGuard 返回 403 Forbidden
- **AND** 响应体包含 `{"message": "需要管理员权限"}`

#### Scenario: 管理员访问管理端点

- **WHEN** role=ADMIN 的 JWT 请求 `/admin/*` 端点
- **THEN** 请求正常通过 RolesGuard
- **AND** 返回业务数据

### Requirement: 用户管理

系统 SHALL 提供用户管理能力供运营人员使用。

#### Scenario: 查看用户列表

- **WHEN** 管理员访问用户管理页
- **THEN** 调用 `GET /admin/users?page=1&pageSize=20&keyword=xxx&status=active`
- **AND** 返回用户列表（id/nickname/mobile/role/status/currentPoints/createdAt）
- **AND** 支持按昵称/手机号模糊搜索 + 状态筛选

#### Scenario: 封禁用户

- **WHEN** 管理员点击"封禁"按钮并确认
- **THEN** 调用 `PUT /admin/users/:id/status` body=`{"status":"banned"}`
- **AND** 用户 status 改为 banned
- **AND** 该用户后续请求 JWT 验证失败（JwtStrategy 检查 status）

#### Scenario: 人工调账

- **WHEN** 管理员在用户详情页输入调整积分数 + 备注
- **THEN** 调用 `POST /admin/users/:id/grant-points` body=`{"amount":100,"reason":"客诉补偿"}`
- **AND** 调用 billing-service 的 `POST /api/v1/points/grant`（携带 INTERNAL_API_KEY）
- **AND** 记录调账日志（operatorId/targetUserId/amount/reason/timestamp）

### Requirement: 审核工作台

系统 SHALL 提供统一的审核工作台，聚合模板审核和形象组授权审核。

#### Scenario: 查看待审核列表

- **WHEN** 管理员访问审核工作台
- **THEN** 调用 `GET /admin/reviews/pending?type=template|avatar|all`
- **AND** 返回待审核项列表（类型/提交人/提交时间/预览链接）

#### Scenario: 审核模板

- **WHEN** 管理员预览模板视频后点击"通过"或"拒绝"
- **THEN** 调用 `POST /admin/templates/:id/review` body=`{"status":"ACTIVE|REJECTED","reviewNote":"xxx"}`
- **AND** 模板状态更新
- **AND** 通过 `notification-service` 推送结果通知给提交者

#### Scenario: 审核形象组授权

- **WHEN** 管理员查看授权书后点击"批准"或"拒绝"
- **THEN** 调用 `PUT /admin/avatar-groups/:id/authorization` body=`{"status":"APPROVED|EXPIRED","note":"xxx"}`
- **AND** 授权状态更新

### Requirement: 内容管理

系统 SHALL 提供作品和模板的内容管理能力。

#### Scenario: 强制下架作品

- **WHEN** 管理员在作品列表中点击"强制下架"
- **THEN** 调用 `DELETE /admin/works/:id` body=`{"reason":"违规内容"}`
- **AND** Work 状态改为 `canceled`（对用户显示为"已下架"）
- **AND** 记录下架日志 + 通知创作者

#### Scenario: 模板上下架

- **WHEN** 管理员在模板列表中切换上下架状态
- **THEN** 调用 `PUT /admin/templates/:id/status` body=`{"status":"ACTIVE|INACTIVE"}`
- **AND** 模板在用户端模板库中显示/隐藏

### Requirement: 套餐管理

系统 SHALL 提供套餐 CRUD 能力。

#### Scenario: 创建套餐

- **WHEN** 管理员填写套餐信息（名称/价格/积分/赠送/排序）并提交
- **THEN** 调用 `POST /admin/packages`
- **AND** 套餐创建后状态为 INACTIVE（需手动上架）

#### Scenario: 套餐上下架

- **WHEN** 管理员点击"上架"
- **THEN** 调用 `PUT /admin/packages/:id/status` body=`{"status":"ACTIVE"}`
- **AND** 用户端可看到该套餐

### Requirement: 订单管理

系统 SHALL 提供全平台订单查询和退款能力。

#### Scenario: 查询订单

- **WHEN** 管理员在订单管理页输入筛选条件
- **THEN** 调用 `GET /admin/orders?page=1&status=paid&startDate=xxx&endDate=xxx`
- **AND** 返回订单列表（订单号/用户/套餐/金额/状态/时间）

#### Scenario: 退款

- **WHEN** 管理员点击"退款"并确认
- **THEN** 调用 `POST /admin/orders/:id/refund` body=`{"reason":"用户客诉"}`
- **AND** 调用微信支付退款 API
- **AND** 扣回用户积分（按套餐积分）
- **AND** 订单状态改为 `refunded`
- **AND** 记录退款日志

### Requirement: 数据统计看板

系统 SHALL 提供运营数据看板。

#### Scenario: 查看概览

- **WHEN** 管理员打开 Dashboard
- **THEN** 调用 `GET /admin/stats/overview?range=7d`
- **AND** 返回指标：DAU / 新增用户 / 生成量 / GMV / 积分消耗
- **AND** 返回趋势图数据（按天聚合）

#### Scenario: 积分流水查询

- **WHEN** 管理员输入时间范围 + 用户 ID
- **THEN** 调用 `GET /admin/stats/points-flow?userId=xxx&startDate=xxx&endDate=xxx`
- **AND** 返回积分流水列表（类型/金额/余额/来源/时间）

### Requirement: 对账监控

系统 SHALL 暴露对账接口供管理员查看和触发。

#### Scenario: 查看对账结果

- **WHEN** 管理员访问对账监控页
- **THEN** 调用 `GET /admin/reconcile/results?date=2026-07-29`
- **AND** 返回不一致记录列表（userId/差异金额/最后对账时间）

#### Scenario: 手动触发对账

- **WHEN** 管理员点击"立即对账"
- **THEN** 调用 `POST /admin/reconcile` body=`{"scope":"all|userId:xxx"}`
- **AND** 后端调用 ReconciliationService 执行对账
- **AND** 返回对账结果摘要

### Requirement: 通知推送

系统 SHALL 提供运营通知推送能力。

#### Scenario: 广播系统公告

- **WHEN** 管理员编辑公告内容 + 选择推送范围
- **THEN** 调用 `POST /admin/notifications/broadcast` body=`{"title":"xxx","content":"xxx","range":"all|active"}`
- **AND** 通过 notification-service 推送给目标用户

### Requirement: API Key 运行时管理

系统 SHALL 提供运行时 API Key 配置能力，避免重启服务。

#### Scenario: 更新 Seedance API Key

- **WHEN** 管理员在系统配置页更新 Seedance API Key 列表
- **THEN** 调用 `PUT /admin/config/api-keys` body=`{"provider":"seedance","keys":["key1","key2"]}`
- **AND** 后端将 Key 存入数据库 `system_config` 表
- **AND** 通过 Redis Pub/Sub 通知所有服务热刷新 Provider
- **AND** SeedanceProvider 从数据库重新加载 Key（无需重启）

#### Scenario: 查看 API Key 状态

- **WHEN** 管理员访问系统配置页
- **THEN** 调用 `GET /admin/config/api-keys`
- **AND** 返回各 Provider 的 Key 状态（已配置/未配置/Key 数量，不返回明文 Key）

## MODIFIED Requirements

### Requirement: 模板审核接口权限加固

原有 `GET /api/v1/templates/pending-review` 和 `POST /api/v1/templates/:id/review` 新增 `@Roles('ADMIN')` 守卫。

#### Scenario: 普通用户调用审核接口被拒

- **WHEN** role=USER 的用户调用模板审核接口
- **THEN** 返回 403 Forbidden

#### Scenario: 管理员调用审核接口

- **WHEN** role=ADMIN 的用户调用模板审核接口
- **THEN** 正常执行审核逻辑

### Requirement: 形象组授权审核拆分

原有 `PUT /api/v1/avatar-groups/:id`（用户可自改授权状态）拆分为：

- `PUT /api/v1/avatar-groups/:id` — 用户仅能修改非授权字段（名称/描述/头像）
- `PUT /admin/avatar-groups/:id/authorization` — 仅管理员可改授权状态

## REMOVED Requirements

### Requirement: 用户自审形象组授权

**Reason**: 安全漏洞 — 用户可自行将授权状态改为 APPROVED
**Migration**: 现有 `PUT /api/v1/avatar-groups/:id` 的 DTO 移除 `authorizationStatus` 字段，审核走 `/admin/avatar-groups/:id/authorization`
