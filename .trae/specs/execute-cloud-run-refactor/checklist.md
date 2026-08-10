# Checklist — 微信云托管版深度重构

## Phase 1: P0 安全/正确性

- [x] user-service JWT 策略迁移到 AuthStrategyModule，6 项安全校验全部生效 ✅ `04546ed`
- [x] auth-service 死代码 jwt.strategy.ts 已删除 ✅ `6cc3ea9`
- [x] profit-sharing-record.controller.ts 不再直接注入 Repository ✅ `4d5c2dc`
- [x] industry.controller.ts 已创建 IndustryService 封装 User 表读写 ✅ `4d5c2dc`
- [x] 所有 billing.client.ts / template.client.ts 中无 localhost fallback ✅ `e09c718`
- [x] 所有服务间 URL 使用 ConfigService.getOrThrow() 获取 ✅ `e09c718`
- [x] typecheck 全绿 ✅ (2026-08-07)
- [x] unit test 全绿 ✅ (user 19 + auth 41 + common 215 + order/workbench 97 = 372 tests)
- [ ] E2E auth flow 通过（待 Phase 2 Task 8 CI 集成后统一验证）

## Phase 2: P1 可维护性

- [x] OrderService.handleCallback 拆分为 5 个私有方法，handleCallback 59 行 ✅ `8f7cfbc`
- [x] 5+ 个 billing.client.ts 统一使用 InternalHttpClient ✅ `73849b6`
- [x] benchmark/billing-client.ts 重命名为 billing.client.ts ✅ `73849b6`
- [x] admin-service 从 axios 迁移到 InternalHttpClient ✅ `73849b6`
- [x] 10/11 个 main.ts 使用 bootstrapService() 工厂函数（media-worker 豁免）✅ `e66f5d5`
- [x] CI 包含 E2E 测试作业（9 服务全部启动，59/95 测试通过）
- [x] database 库 25 个实体有单元测试（172 个测试，含 @Index->@Column 回归守卫）
- [x] 11 个 Dockerfile 使用统一模板（Node 20-alpine + HEALTHCHECK + ENV PORT）
- [x] template-service Dockerfile 从 Node 18 升级到 Node 20
- [ ] 所有 Dockerfile CMD 路径统一为 apps/SERVICE/dist/main.js
- [x] 根 .env.example 作为权威配置模板
- [x] DATABASE_PASSWORD / JWT_SECRET 默认值统一
- [x] test:integration 脚本可执行
- [ ] Docker 镜像体积 < 400MB
- [ ] Temporal 部署方案文档输出

## Phase 3: P2 一致性

- [x] auth-service adminLogin 使用 BusinessException
- [x] AllExceptionsFilter 统一用 APP_FILTER 注册
- [x] order.service.ts 无 process.env 直接访问
- [x] 文件命名统一为 billing.client.ts
- [x] asset/template main.ts 无 console.log
- [ ] CURRENT_ARCHITECTURE.md 更新（common->database + 云托管）
- [x] template.client.ts 使用 InternalHttpClient
- [ ] admin-web 有 jest 配置和页面渲染测试
- [ ] oss 库有单元测试
- [x] libs/database/src 无编译产物（清理 156 个 .js/.d.ts 文件）
- [x] jest.config.js 修复编译产物加载（moduleFileExtensions 顺序 + transformIgnorePatterns for ali-oss）

## Phase 4: P3 锦上添花

- [ ] 8 个 deprecated jwt.strategy.ts 薄封装已删除
- [ ] 小程序有基础 Modal 组件
- [ ] 小程序 taroStorage 提取到 stores/storage.ts
- [ ] admin-web 有 ListPage 通用组件
- [ ] 手写类型迁移到 generated 类型
- [x] libs/database/src 无编译产物（清理 156 个 .js/.d.ts 文件）
- [x] tsconfig 启用 allowImportingTsExtensions
- [ ] 生产代码无 any 类型
- [ ] 条件编译规范化 + H5 配置预置

## 最终验证

- [x] Typecheck 全绿 (2026-08-10)
- [x] Unit test 全绿 (102 套件 / 1559 测试, 2026-08-10)
- [ ] CI Lint · Typecheck · Test · Build 全绿
- [ ] CI Docker build 11/11 全绿
- [ ] CI Mini Program build 全绿
- [ ] E2E 95 个用例全部通过
- [ ] 后端覆盖率不低于基线（Stmts 54.52% / Branches 38.29%）
