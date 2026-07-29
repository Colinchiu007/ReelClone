# Checklist

## 阶段一：环境准备

- [ ] PostgreSQL 容器启动且 healthy（端口 5432）
- [ ] Redis 容器启动且 healthy（端口 6379）
- [ ] Temporal 容器启动（端口 7233）
- [ ] main 库迁移完成（users/works/assets/benchmarks 等表存在）
- [ ] billing 库迁移完成（orders/point_transactions/user_packages 等表存在）
- [ ] template 库迁移完成（templates 表存在）
- [ ] benchmark 库迁移完成（benchmarks 表存在）
- [ ] system_config 表存在（configKey/configValue/description/updatedAt）
- [ ] 管理员账号已创建（mobile + bcrypt 密码，role=SUPER_ADMIN）
- [ ] 管理员可通过 `POST /api/v1/auth/admin-login` 登录获取 JWT
- [ ] JWT payload 包含 role: SUPER_ADMIN

## 阶段二：微服务部署

- [ ] auth-service 启动（端口 3001，/health 200）
- [ ] user-service 启动（端口 3002，/health 200）
- [ ] asset-service 启动（端口 3003，/health 200）
- [ ] workbench-service 启动（端口 3004，/health 200）
- [ ] benchmark-service 启动（端口 3005，/health 200）
- [ ] billing-service 启动（端口 3006，/health 200）
- [ ] template-service 启动（端口 3007，/health 200）
- [ ] notification-service 启动（端口 3008，/health 200）
- [ ] api-gateway 启动（端口 3000，/health 200）
- [ ] admin-service 启动（端口 3011，/health 200）
- [ ] admin-web dev server 启动（端口 3021，登录页可访问）
- [ ] 服务间通信正常（gateway 可路由到各服务）

## 阶段三：既有 E2E 测试

- [ ] `001-auth-home-generate-work.spec.ts` 通过（登录→首页→文生视频→生成作品）
- [ ] `002-upload-generate-download.spec.ts` 通过（上传→生成→下载）
- [ ] `003-benchmark-generate.spec.ts` 通过（对标解析→基于拆解生成）
- [ ] `004-purchase-consume.spec.ts` 通过（购买套餐→消费积分）
- [ ] `005-avatar-group-generate.spec.ts` 通过（形象组→生成）
- [ ] `auth.api.spec.ts` 通过
- [ ] `user.api.spec.ts` 通过
- [ ] `billing.api.spec.ts` 通过
- [ ] `order.api.spec.ts` 通过
- [ ] `notification.api.spec.ts` 通过
- [ ] 失败用例附根因分析

## 阶段四：运营后台 E2E 关键流程

- [ ] 管理员登录成功，获取 JWT
- [ ] `GET /admin/stats/overview?range=7d` 返回 DAU/新增/GMV/生成量数据
- [ ] 普通用户 JWT 调用 `/admin/*` 返回 403
- [ ] 创建测试用户并登录
- [ ] 管理员封禁该用户，status 变为 FROZEN
- [ ] Redis 写入 `user:password-changed:{userId}` 黑名单 key
- [ ] 被封禁用户原 JWT 调用业务接口返回 401
- [ ] 提交 UGC 模板（状态 PENDING_REVIEW）
- [ ] 管理员审核模板通过，状态变为 ACTIVE
- [ ] 管理员创建套餐并上架
- [ ] 用户购买套餐生成订单
- [ ] 管理员退款，积分扣回 + 订单状态 REFUNDED
- [ ] `GET /admin/config/api-keys` 返回各 Provider Key 状态
- [ ] `PUT /admin/config/api-keys` 更新 Seedance Key 成功
- [ ] system_config 表记录更新
- [ ] Redis Pub/Sub 发布 config:updated 消息
- [ ] SeedanceProvider 收到通知后 reloadKeys

## 阶段五：实际抖音链接复刻链路

- [ ] 找到一个公开可访问的抖音视频链接
- [ ] 验证该链接可被视频下载器下载
- [ ] 用户登录获取 JWT
- [ ] `POST /api/v1/benchmarks` 提交抖音链接成功
- [ ] 轮询 `GET /api/v1/benchmarks/:id` 状态变为 COMPLETED
- [ ] 返回结构化报告（场景切分/ASR/OCR/VLM 分析）
- [ ] `POST /api/v1/benchmarks/:id/clone` 触发复刻成功
- [ ] 返回 prompt + 推荐参数
- [ ] `POST /api/v1/generations` 携带 benchmarkId 提交生成
- [ ] 轮询等待生成完成
- [ ] 作品记录可查看
- [ ] 视频/封面可下载或预览（Mock 模式返回模拟 URL）

## 阶段六：API Key 配置支持验证

- [ ] 环境变量方式验证（`.env` 中 `SEEDANCE_API_KEYS=key1,key2`）
- [ ] 数据库方式验证（`PUT /admin/config/api-keys` 更新）
- [ ] 热刷新验证（更新后不重启服务，新 Key 生效）
- [ ] Mock 模式降级验证（清空 Key 后服务返回 Mock 数据）
- [ ] 明确结论：是否需要视频模型 API Key（是，需要 Seedance Key）
- [ ] 明确结论：系统是否支持 API Key 配置（是，三种方式）

## 阶段七：文档与记忆

- [ ] E2E 测试通过/失败汇总表
- [ ] 运营后台 6 个关键流程验证结果
- [ ] 抖音链接复刻链路验证结果
- [ ] 发现的问题清单 + 修复建议
- [ ] `project_memory.md` 已更新 E2E 验证结论
- [ ] 用户问题已明确回答（API Key 需求 + 配置支持）

## 验证总结

| 阶段                  | 检查点数 | 通过  | 失败  |
| --------------------- | -------- | ----- | ----- |
| 阶段一：环境准备      | 11       | 0     | 0     |
| 阶段二：微服务部署    | 12       | 0     | 0     |
| 阶段三：既有 E2E 测试 | 11       | 0     | 0     |
| 阶段四：运营后台 E2E  | 17       | 0     | 0     |
| 阶段五：抖音链接复刻  | 12       | 0     | 0     |
| 阶段六：API Key 验证  | 6        | 0     | 0     |
| 阶段七：文档与记忆    | 6        | 0     | 0     |
| **总计**              | **75**   | **0** | **0** |
