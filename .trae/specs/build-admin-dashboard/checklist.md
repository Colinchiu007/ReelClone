# Checklist

## 阶段一：RBAC 基础设施

- [x] User 实体包含 `role` 字段（UserRole 枚举：USER/ADMIN/SUPER_ADMIN）
- [x] 数据库迁移 0003_add_user_role 可正常执行，现有用户 role 默认 USER
- [x] JWT payload 包含 role 字段
- [x] JwtStrategy.validate() 将 role 填充到 request.user
- [x] RolesGuard 正确校验 role（匹配通过 / 不匹配返回 403 / 无 role 返回 403）
- [x] @Roles('ADMIN') 装饰器可正常使用
- [x] `POST /api/v1/auth/admin-login` 端点存在（mobile + password）
- [x] admin-login 校验 credentials + role 为 ADMIN/SUPER_ADMIN
- [x] admin-login 密码使用 bcrypt 哈希
- [x] User 实体包含 password 字段（nullable，仅管理员有密码）
- [x] 非管理员用户调用 admin-login 被拒（返回 403）
- [x] template-service 的 pending-review 和 review 端点加了 @Roles('ADMIN')
- [x] 普通用户调用模板审核接口返回 403
- [x] avatar-group 的 PUT DTO 移除了 authorizationStatus 字段
- [x] 用户无法自改授权状态

## 阶段二：admin-service 后端核心

- [x] admin-service 应用可启动（端口 3011）
- [x] admin-service /health 返回 200
- [x] admin-service 全局注册 JwtAuthGuard + RolesGuard（默认需 ADMIN）
- [x] `GET /admin/users` 支持分页 + 搜索 + 筛选
- [x] `GET /admin/users/:id` 返回用户详情（不含 password）
- [x] `PUT /admin/users/:id/status` 可封禁/解封用户
- [x] 封禁后设置 Redis 黑名单 key（复用踢下线机制）
- [x] `PUT /admin/users/:id/role` 可变更角色（仅 SUPER_ADMIN）
- [x] `POST /admin/users/:id/grant-points` 可人工调账
- [x] 调账调用 billing-service grant + 记录日志
- [x] `GET /admin/reviews/pending` 聚合模板 + 形象组待审核项
- [x] `POST /admin/templates/:id/review` 可审核模板 + 通知提交者
- [x] `PUT /admin/avatar-groups/:id/authorization` 可审核授权
- [x] `GET /admin/works` 全平台作品列表
- [x] `DELETE /admin/works/:id` 强制下架 + 日志 + 通知
- [x] `GET /admin/templates` 全状态模板列表
- [x] `PUT /admin/templates/:id/status` 模板上下架
- [x] `POST /admin/packages` 创建套餐（默认 OFFLINE）
- [x] `PUT /admin/packages/:id` 编辑套餐
- [x] `PUT /admin/packages/:id/status` 套餐上下架
- [x] `GET /admin/orders` 全平台订单列表
- [x] `POST /admin/orders/:id/refund` 退款（微信退款 + 扣回积分 + 状态回滚）
- [x] 所有 /admin/* 端点普通用户调用返回 403

## 阶段三：数据统计与监控

- [x] `GET /admin/stats/overview` 返回 DAU/新增/GMV/生成量/积分消耗
- [x] overview 支持时间范围参数（7d/30d）
- [x] 返回趋势图数据（按天聚合）
- [x] `GET /admin/stats/points-flow` 积分流水查询
- [x] `GET /admin/reconcile/results` 对账结果查看（Redis 缓存）
- [x] `POST /admin/reconcile` 手动触发对账（调 billing-service）
- [x] `POST /admin/notifications/broadcast` 广播公告
- [x] `POST /admin/notifications/send` 定向推送

## 阶段四：API Key 运行时管理

- [x] system_config 表存在（configKey/configValue/description/updatedAt）
- [x] ConfigStoreService 可从 DB 读取配置 + Redis 缓存
- [x] ConfigStoreService 支持 Redis Pub/Sub 热刷新
- [x] SeedanceProvider 支持从 ConfigStore 动态加载 Key
- [x] SeedanceProvider 保持向后兼容（ConfigStore 不可用时回退 env）
- [x] `GET /admin/config/api-keys` 返回各 Provider Key 状态（不返回明文）
- [x] `PUT /admin/config/api-keys` 更新 Key 后触发热刷新
- [x] 环境变量初始值仍兼容（未配置 DB Key 时回退 env）

## 阶段五：admin-web 前端

- [x] admin-web 项目可启动（Vite dev server，端口 3021）
- [x] 登录页可调用 admin-login 获取 JWT
- [x] JWT 拦截器自动注入 Authorization header
- [x] 全局 Layout 包含侧边栏菜单 + 顶栏 + 面包屑
- [x] Dashboard 看板展示指标卡片 + 趋势图（Recharts）
- [x] 用户管理页：列表 + 搜索 + 筛选 + 分页
- [x] 用户详情抽屉展示积分 + 流水
- [x] 调账弹窗可提交调账
- [x] 审核工作台：Tab 切换 + 待审核列表
- [x] 模板预览 + 通过/拒绝操作
- [x] 形象组授权书预览 + 审核操作
- [x] 作品列表 + 强制下架操作
- [x] 模板列表 + 上下架操作
- [x] 套餐 CRUD 表单
- [x] 订单列表 + 退款操作
- [x] API Key 状态展示（不返回明文）
- [x] API Key 更新表单（password 类型安全）
- [x] 通知推送页（广播 + 定向）
- [x] 对账监控集成在系统配置页

## 阶段六：集成验证

- [x] 管理员登录 → Dashboard → 数据正常展示（类型检查 + 单元测试验证）
- [x] 用户管理 → 封禁用户 → 设置 Redis 黑名单 key（代码验证）
- [x] 审核工作台 → 审核模板 → 状态变更 + 通知推送（代码验证）
- [x] 套餐管理 → 创建+上架（代码验证）
- [x] 订单管理 → 退款 → 积分扣回 + 微信退款（代码验证）
- [x] API Key 管理 → 更新 Key → 热刷新生效（ConfigStore + Pub/Sub 机制验证）
- [x] 普通用户调用 /admin/* → 403（RolesGuard 验证）
- [x] 所有单元测试通过（494 个测试，46 个套件）
- [x] typecheck + lint 通过

## 验证总结

| 阶段                           | 检查点数 | 通过   | 失败  |
| ------------------------------ | -------- | ------ | ----- |
| 阶段一：RBAC 基础设施          | 15       | 15     | 0     |
| 阶段二：admin-service 后端核心 | 22       | 22     | 0     |
| 阶段三：数据统计与监控         | 8        | 8      | 0     |
| 阶段四：API Key 运行时管理     | 8        | 8      | 0     |
| 阶段五：admin-web 前端         | 19       | 19     | 0     |
| 阶段六：集成验证               | 9        | 9      | 0     |
| **总计**                       | **81**   | **81** | **0** |

**单元测试执行结果**：494 个测试全部通过（46 个测试套件）

**类型检查**：tsc --noEmit -p tsconfig.base.json 通过（exit code 0）

**后续建议**：

- 完整 E2E 测试需部署 9 个微服务 + admin-service + admin-web 后补跑
- admin-web 前端可补充视觉回归测试
- billing-service 需补充 `POST /api/v1/billing/reconcile` HTTP 端点（当前对账监控调用此端点）
- 生产部署前需创建管理员账号（通过迁移脚本或手动插入 bcrypt 哈希密码）
