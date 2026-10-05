# 小程序上线阻塞问题修复 — 校验清单

## P0 上线阻塞

- [x] 1.1 `project.config.json` 已创建，包含 appid、miniprogramRoot、setting 编译配置
- [x] 1.2 `sitemap.json` 已创建，配置正确
- [ ] 1.3 微信开发者工具可成功导入 `apps/miniprogram/` 目录
- [x] 2.1 `WS_BASE_URL` 已通过 Taro defineConstants 环境变量注入
- [x] 2.2 `useWebSocket.ts` 不再包含 `ws://localhost:3008` 硬编码
- [x] 2.3 `token.ts` 和 `request.ts` 的 API_BASE_URL fallback 使用环境变量
- [x] 2.4 `config/dev.ts` 和 `config/prod.ts` 环境变量配置正确
- [x] 2.5 `.env.example` 已补充 WS_BASE_URL
- [x] 3.1 `config/index.ts` 的 `alias` 中已添加 `@reelclone/capability` 映射
- [x] 3.2 `tsconfig.json` 与 `config/index.ts` 的别名路径一致
- [x] 4.1 统一平台枚举常量已定义（后端兼容的大写枚举值）
- [x] 4.2 `pages/recommend/index.tsx` 使用统一枚举
- [x] 4.3 `pages/template/gallery/index.tsx` 使用统一枚举
- [x] 4.4 `pages/workbench/publish-template/index.tsx` 使用统一枚举
- [x] 4.5 `pages/benchmark/index.tsx` 使用统一枚举
- [x] 5.1 本地 `npm run build:miniprogram` 构建成功
- [ ] 5.2 CI `Build Mini Program (weapp)` 任务通过

## P1 影响审核/体验

- [x] 6.1 `pages/template/detail/index.tsx` 已添加 `useShareAppMessage`
- [x] 6.2 `pages/workbench/work-detail/index.tsx` 已添加 `useShareAppMessage`
- [x] 6.3 `pages/benchmark/detail/index.tsx` 已添加 `useShareAppMessage`
- [x] 7.1 通知铃铛点击不再显示"即将上线"占位
- [x] 7.2 通知铃铛点击跳转到通知列表页
- [x] 8.1 所有 TabBar 页面已设置动态导航标题
- [x] 8.2 所有工作台页面已设置动态导航标题
- [x] 9.1 `pages/benchmark/index.tsx` 已实现上拉加载更多
- [x] 9.2 `pages/billing/transactions/index.tsx` 已实现上拉加载
- [x] 9.3 `pages/billing/orders/index.tsx` 已实现上拉加载
- [x] 10.1 `auth.store.ts` 中 `user` 不再包含 `currentPoints` 字段
- [x] 10.2 积分查询统一使用 `points.store` 或 `useCredits` Hook
- [x] 10.3 所有引用 `user.currentPoints` 的地方已迁移

## 回归验证

- [x] 小程序 typecheck 通过
- [x] 小程序单元测试全部通过（覆盖率不掉）
- [x] 后端 typecheck 通过（无影响）
- [ ] 后端单元测试全部通过

## 待人工/CI验证

- [ ] 微信开发者工具成功导入 `apps/miniprogram/` 目录
- [ ] 远程 CI `Build Mini Program (weapp)` 任务通过
- [ ] 后端全量 unit test 在 CI 或资源充足环境中全部通过
