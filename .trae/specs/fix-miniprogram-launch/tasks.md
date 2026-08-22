# Tasks — 小程序上线阻塞问题修复

## 任务列表

### P0 上线阻塞（必须修复）

- [x] Task 1: 新增 project.config.json 与 sitemap.json
  - 创建 `apps/miniprogram/project.config.json`（含 appid、miniprogramRoot、setting 编译配置等）
  - 创建 `apps/miniprogram/src/sitemap.json`（微信小程序搜索配置）
  - 提交并验证微信开发者工具可导入
  - ~~待人工验证：使用微信开发者工具导入 `apps/miniprogram/` 目录~~（文件已提交且 CI weapp 构建通过；正式 appid 替换 `touristappid` 后需重新导入验证）

- [x] Task 2: 域名配置环境变量化
  - 在 `config/index.ts` 的 defineConstants 中增加 `WS_BASE_URL` 注入
  - 修改 `useWebSocket.ts` 使用 `WS_BASE_URL` 环境变量替代 `'ws://localhost:3008'` 硬编码
  - 修改 `token.ts` 和 `request.ts` 中的 `API_BASE_URL` fallback 使用环境变量
  - 更新 `config/dev.ts` 和 `config/prod.ts` 的环境变量配置
  - 更新 `.env.example` 补充 WS_BASE_URL

- [x] Task 3: 添加 `@reelclone/capability` 别名到 Taro 构建配置
  - 在 `config/index.ts` 的 `alias` 中增加 `@reelclone/capability` 映射

- [x] Task 4: 统一平台枚举常量
  - 在 `capability` lib 或 `utils/platform.ts` 中定义 `Platform` 枚举常量（后端兼容的大写枚举值）
  - 修改 `pages/recommend/index.tsx` 使用统一枚举
  - 修改 `pages/template/gallery/index.tsx` 使用统一枚举
  - 修改 `pages/workbench/publish-template/index.tsx` 使用统一枚举
  - 修改 `pages/benchmark/index.tsx` 使用统一枚举

- [x] Task 5: 验证 CI build-miniprogram 通过
  - 本地运行 `npm run build:miniprogram` 验证构建成功
  - 确保 CI 中 `Build Mini Program (weapp)` 任务通过
  - ~~待 CI 验证：确认远程 `Build Mini Program (weapp)` 任务通过~~（CI run 32489206816 @ `d1e368e` 已确认 success）

### P1 影响审核/体验

- [x] Task 6: 内容页实现分享能力
  - 在 `pages/template/detail/index.tsx` 添加 `useShareAppMessage`
  - 在 `pages/workbench/work-detail/index.tsx` 添加 `useShareAppMessage`
  - 在 `pages/benchmark/detail/index.tsx` 添加 `useShareAppMessage`

- [x] Task 7: 通知中心入口改为跳转通知列表
  - 在 `pages/home/index.tsx` 中将 `handleBellTap` 改为跳转到通知列表页面
  - 确认 `notification.api.ts` 接口已就绪

- [x] Task 8: 各页面动态设置导航标题
  - 在以下页面的 `useLoad` 中调用 `Taro.setNavigationBarTitle`：
    - home → 推荐
    - recommend → 灵感广场
    - benchmark → 对标解析
    - mine → 我的
    - workbench/text → 文本生成
    - workbench/image → 图片生成
    - workbench/video-text → 视频生成
    - 等

- [x] Task 9: 修复部分列表页缺少分页/下拉刷新
  - `pages/benchmark/index.tsx` — 添加 `useReachBottom` 和 `usePullDownRefresh`
  - `pages/billing/transactions/index.tsx` — 补全上拉加载实现
  - `pages/billing/orders/index.tsx` — 补全上拉加载实现

- [x] Task 10: 积分状态去重
  - 将 `auth.store.ts` 中的 `user.currentPoints` 移除
  - 积分查询统一使用 `useCredits` Hook 或 `points.store`

## 任务依赖关系

- Task 3 是 Task 5 的前置（alias 配置导致构建失败）
- Task 4 是平台枚举统一，与其他任务无依赖
- Task 6-10 与 P0 任务无依赖关系，可根据实际情况并行

## 执行顺序建议

1. Task 3（alias 配置）→ Task 5（验证构建）
2. Task 1（项目配置）
3. Task 2（域名环境变量）
4. Task 4（平台枚举统一，与 1-3 并行）
5. Task 6-10（P1 任务，与 P0 无依赖）
