# Tasks

## 阶段一：RBAC 基础设施（P0 安全修复 — 必须先做）

- [x] Task 1: User 实体新增 role 字段 + 迁移 ✅
  - [ ] SubTask 1.1: `libs/database/src/entities/user.entity.ts` 新增 `role` 字段（`UserRole` 枚举：USER / ADMIN / SUPER_ADMIN，默认 USER）
  - [ ] SubTask 1.2: 新增迁移 `libs/database/src/migrations/main/0003_add_user_role.ts`
  - [ ] SubTask 1.3: `libs/common/src/decorators/current-user.decorator.ts` 已预留 role 字段，确认类型对齐
  - **验收**: 迁移可执行，现有用户 role 默认为 USER

- [x] Task 2: JWT payload 携带 role ✅
  - [ ] SubTask 2.1: `apps/auth-service/src/auth/jwt.service.ts` signAccessToken 在 payload 中加入 `role`
  - [ ] SubTask 2.2: `apps/auth-service/src/auth/jwt.strategy.ts` validate 方法填充 `role` 到 request.user
  - **验收**: JWT 解码后含 role 字段

- [x] Task 3: 新增 RolesGuard + @Roles 装饰器 ✅
  - [ ] SubTask 3.1: `libs/common/src/guards/roles.guard.ts` — 校验 request.user.role 是否在 @Roles 列表中
  - [ ] SubTask 3.2: `libs/common/src/decorators/roles.decorator.ts` — `@Roles('ADMIN')` 装饰器
  - [ ] SubTask 3.3: 单元测试（role 匹配通过 / 不匹配 403 / 无 role 403）
  - **验收**: RolesGuard 可正常拦截非管理员请求

- [x] Task 4: 新增管理员登录端点 ✅
  - [ ] SubTask 4.1: `apps/auth-service/src/auth/auth.controller.ts` 新增 `POST /api/v1/auth/admin-login`（username + password）
  - [ ] SubTask 4.2: `apps/auth-service/src/auth/auth.service.ts` 新增 `adminLogin` 方法 — 校验 credentials + role 为 ADMIN/SUPER_ADMIN
  - [ ] SubTask 4.3: User 实体新增 `passwordHash` 字段（nullable，仅管理员有密码）+ 迁移
  - [ ] SubTask 4.4: 使用 bcrypt 哈希密码
  - [ ] SubTask 4.5: 单元测试（登录成功 / 密码错误 / 非管理员被拒）
  - **验收**: 管理员可通过账号密码登录获取 JWT

- [x] Task 5: 修复现有权限漏洞 ✅
  - [ ] SubTask 5.1: `apps/template-service/src/template/template.controller.ts` 给 `pending-review` 和 `:id/review` 加 `@Roles('ADMIN')` 守卫
  - [ ] SubTask 5.2: `apps/asset-service/src/asset/avatar-group.controller.ts` 从 `PUT /api/v1/avatar-groups/:id` DTO 移除 `authorizationStatus` 字段
  - [ ] SubTask 5.3: 单元测试验证权限拦截
  - **验收**: 普通用户无法调用审核接口

## 阶段二：admin-service 后端核心（依赖阶段一完成）

- [x] Task 6: 创建 admin-service 应用骨架 ✅
  - [ ] SubTask 6.1: `apps/admin-service/` 项目结构（main.ts + app.module.ts + Dockerfile）
  - [ ] SubTask 6.2: 全局 JwtAuthGuard + RolesGuard 注册（所有端点默认需 ADMIN 角色）
  - [ ] SubTask 6.3: 配置端口 3011 + DATABASE/REDIS 环境变量
  - [ ] SubTask 6.4: Nx workspace 注册 admin-service 项目
  - **验收**: 服务可启动 + /health 返回 200

- [x] Task 7: 用户管理模块 ✅
  - [ ] SubTask 7.1: `GET /admin/users` — 分页列表 + 搜索（nickname/mobile）+ 筛选（status/role）
  - [ ] SubTask 7.2: `GET /admin/users/:id` — 用户详情（含积分余额 + 最近 10 条流水）
  - [ ] SubTask 7.3: `PUT /admin/users/:id/status` — 封禁/解封（status: active/banned）
  - [ ] SubTask 7.4: `PUT /admin/users/:id/role` — 角色变更（仅 SUPER_ADMIN 可操作）
  - [ ] SubTask 7.5: `POST /admin/users/:id/grant-points` — 人工调账（调 billing-service grant + 记日志）
  - [ ] SubTask 7.6: 单元测试（列表/详情/封禁/调账）
  - **验收**: 管理员可查询和管理用户

- [x] Task 8: 审核工作台模块 ✅
  - [ ] SubTask 8.1: `GET /admin/reviews/pending` — 聚合待审核列表（模板 + 形象组，支持 type 筛选）
  - [ ] SubTask 8.2: `POST /admin/templates/:id/review` — 模板审核（代理调 template-service + 通知提交者）
  - [ ] SubTask 8.3: `PUT /admin/avatar-groups/:id/authorization` — 形象组授权审核
  - [ ] SubTask 8.4: 单元测试
  - **验收**: 审核工作台可查看和处理待审核项

- [x] Task 9: 内容管理模块 ✅
  - [ ] SubTask 9.1: `GET /admin/works` — 全平台作品列表（筛选 status/userId/时间）
  - [ ] SubTask 9.2: `DELETE /admin/works/:id` — 强制下架（status→canceled + 日志 + 通知）
  - [ ] SubTask 9.3: `GET /admin/templates` — 全状态模板列表
  - [ ] SubTask 9.4: `PUT /admin/templates/:id/status` — 模板上下架（ACTIVE/INACTIVE）
  - [ ] SubTask 9.5: 单元测试
  - **验收**: 管理员可管理和下架内容

- [x] Task 10: 套餐管理模块 ✅
  - [ ] SubTask 10.1: `POST /admin/packages` — 创建套餐
  - [ ] SubTask 10.2: `PUT /admin/packages/:id` — 编辑套餐
  - [ ] SubTask 10.3: `PUT /admin/packages/:id/status` — 上下架（ACTIVE/INACTIVE）
  - [ ] SubTask 10.4: 单元测试
  - **验收**: 管理员可 CRUD 套餐

- [x] Task 11: 订单管理模块 ✅
  - [ ] SubTask 11.1: `GET /admin/orders` — 全平台订单列表（筛选 status/时间/用户）
  - [ ] SubTask 11.2: `POST /admin/orders/:id/refund` — 退款（调微信支付退款 + 扣回积分 + 状态回滚）
  - [ ] SubTask 11.3: 单元测试
  - **验收**: 管理员可查询订单和执行退款

## 阶段三：admin-service 数据统计与监控（依赖阶段二完成）

- [x] Task 12: 数据统计模块 ✅
  - [ ] SubTask 12.1: `GET /admin/stats/overview` — 概览指标（DAU/新增/GMV/生成量/积分消耗，按天聚合 7d/30d）
  - [ ] SubTask 12.2: `GET /admin/stats/points-flow` — 积分流水查询（跨用户/时间窗口）
  - [ ] SubTask 12.3: 单元测试
  - **验收**: 看板数据可正常返回

- [x] Task 13: 对账监控模块 ✅
  - [ ] SubTask 13.1: `GET /admin/reconcile/results` — 对账结果查看（按日期）
  - [ ] SubTask 13.2: `POST /admin/reconcile` — 手动触发对账（调 ReconciliationService）
  - [ ] SubTask 13.3: 单元测试
  - **验收**: 管理员可查看对账结果和触发对账

- [x] Task 14: 通知推送模块 ✅
  - [ ] SubTask 14.1: `POST /admin/notifications/broadcast` — 广播公告（调 notification-service）
  - [ ] SubTask 14.2: `POST /admin/notifications/send` — 定向推送（指定 userId）
  - [ ] SubTask 14.3: 单元测试
  - **验收**: 管理员可推送通知

## 阶段四：API Key 运行时管理（依赖阶段二完成，可与阶段三并行）

- [x] Task 15: 系统配置表 + Provider 热刷新 ✅
  - [ ] SubTask 15.1: 新增 `system_config` 表（key/value/updatedAt）+ 迁移
  - [ ] SubTask 15.2: `libs/common/src/config/config-store.service.ts` — 从 DB 读取配置 + Redis 缓存 + Pub/Sub 热刷新
  - [ ] SubTask 15.3: SeedanceProvider 改造 — 支持从 ConfigStore 动态加载 Key（保留 env 初始值兼容）
  - [ ] SubTask 15.4: LlmProvider 改造 — 同上
  - [ ] SubTask 15.5: 单元测试
  - **验收**: API Key 可通过 DB 动态更新，无需重启

- [x] Task 16: API Key 管理端点 ✅
  - [ ] SubTask 16.1: `GET /admin/config/api-keys` — 查看各 Provider Key 状态（不返回明文）
  - [ ] SubTask 16.2: `PUT /admin/config/api-keys` — 更新 Key（存 DB + Pub/Sub 通知热刷新）
  - [ ] SubTask 16.3: 单元测试
  - **验收**: 管理员可在后台管理 API Key

## 阶段五：admin-web 前端（依赖阶段二完成，可与阶段三/四并行）

- [x] Task 17: admin-web 项目骨架 ✅
  - [ ] SubTask 17.1: `apps/admin-web/` Vite + React 18 + Ant Design Pro 5 项目初始化
  - [ ] SubTask 17.2: 路由配置 + 登录页 + JWT 拦截器 + API 封装
  - [ ] SubTask 17.3: 全局 Layout（侧边栏菜单 + 顶栏用户信息 + 面包屑）
  - [ ] SubTask 17.4: Nx workspace 注册 admin-web 项目
  - **验收**: 登录页可正常登录 + Dashboard 空壳可访问

- [x] Task 18: Dashboard 看板页 ✅
  - [ ] SubTask 18.1: 指标卡片（DAU/新增/GMV/生成量）+ 趋势折线图
  - [ ] SubTask 18.2: 调用 `GET /admin/stats/overview`
  - **验收**: 看板页展示实时数据

- [x] Task 19: 用户管理页 ✅
  - [ ] SubTask 19.1: 用户列表表格（搜索/筛选/分页）+ 操作按钮（详情/封禁/调账/角色）
  - [ ] SubTask 19.2: 用户详情抽屉（积分余额 + 最近流水）
  - [ ] SubTask 19.3: 调账弹窗（金额 + 备注）
  - **验收**: 用户管理全流程可操作

- [x] Task 20: 审核工作台页 ✅
  - [ ] SubTask 20.1: 待审核列表（Tab 切换：全部/模板/形象组）
  - [ ] SubTask 20.2: 模板预览 + 通过/拒绝操作
  - [ ] SubTask 20.3: 形象组授权书预览 + 审核操作
  - **验收**: 审核工作台全流程可操作

- [x] Task 21: 内容管理 + 套餐管理 + 订单管理页 ✅
  - [ ] SubTask 21.1: 作品列表 + 强制下架
  - [ ] SubTask 21.2: 模板列表 + 上下架
  - [ ] SubTask 21.3: 套餐 CRUD 表单
  - [ ] SubTask 21.4: 订单列表 + 退款操作
  - **验收**: 内容/套餐/订单管理可操作

- [x] Task 22: 系统配置页 ✅
  - [ ] SubTask 22.1: API Key 状态展示（Seedance/LLM/OSS）
  - [ ] SubTask 22.2: API Key 更新表单
  - [ ] SubTask 22.3: 对账监控页（结果列表 + 触发按钮）
  - **验收**: 系统配置可查看和更新

## 阶段六：集成验证

- [x] Task 23: 端到端验证 ✅
  - [ ] SubTask 23.1: 管理员登录 → Dashboard → 用户管理 → 封禁用户 → 验证用户被踢下线
  - [ ] SubTask 23.2: 审核工作台 → 审核模板 → 验证模板状态变更 + 通知推送
  - [ ] SubTask 23.3: 套餐管理 → 创建套餐 → 上架 → 小程序可购买
  - [ ] SubTask 23.4: 订单管理 → 退款 → 验证积分扣回 + 微信退款
  - [ ] SubTask 23.5: API Key 管理 → 更新 Seedance Key → 验证热刷新生效
  - [ ] SubTask 23.6: 普通用户调用 /admin/* 端点 → 验证 403
  - **验收**: 完整运营流程跑通 + 权限隔离正确

# Task Dependencies

```
阶段一（RBAC 基础设施）
  Task 1 (role 字段) ──→ Task 2 (JWT role) ──→ Task 3 (RolesGuard) ──→ Task 4 (admin-login)
                                                                    ──→ Task 5 (修复漏洞)

阶段二（admin-service 核心）— 依赖阶段一
  Task 6 (骨架) ──→ Task 7 (用户管理)
                ──→ Task 8 (审核工作台)
                ──→ Task 9 (内容管理)
                ──→ Task 10 (套餐管理)
                ──→ Task 11 (订单管理)

阶段三（数据统计）— 依赖阶段二
  Task 12 (统计) ──→ Task 13 (对账) ──→ Task 14 (通知)

阶段四（API Key 管理）— 依赖阶段二，可与阶段三并行
  Task 15 (配置表+热刷新) ──→ Task 16 (Key 管理端点)

阶段五（admin-web 前端）— 依赖阶段二，可与阶段三/四并行
  Task 17 (骨架) ──→ Task 18 (Dashboard)
                ──→ Task 19 (用户管理)
                ──→ Task 20 (审核工作台)
                ──→ Task 21 (内容/套餐/订单)
                ──→ Task 22 (系统配置)

阶段六（集成验证）— 依赖所有
  Task 23 (E2E 验证)
```

- 阶段一必须最先完成（安全修复 + RBAC 基线）
- 阶段二依赖阶段一（需要 RolesGuard 保护端点）
- 阶段三、四、五可并行（都依赖阶段二完成）
- 阶段六依赖所有前置任务
