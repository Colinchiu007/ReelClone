# 小程序上线阻塞问题修复 Spec

## Why

经过全量代码审查，ReelClone 微信小程序存在 6 个阻塞性问题和多项影响审核/体验的问题，若不修复无法通过微信开发者工具导入、预览、上传及提交审核，导致小程序无法上线微信平台。

## What Changes

### P0 — 上线阻塞（必须修复）

1. 创建 `project.config.json` 与 `sitemap.json`，使微信开发者工具可导入项目
2. 域名配置：API_BASE_URL 与 WS_BASE_URL 支持环境变量注入，去除 localhost 硬编码；生产环境使用 https/wss 域名
3. 添加 `@reelclone/capability` 别名到 Taro 构建配置的 `alias` 中，修复 weapp 构建失败
4. 统一平台枚举值：4 个页面（recommend/template/gallery/publish-template/benchmark）使用同一枚举常量，并提交后端兼容的大写枚举值
5. 修复 CI 中 build-miniprogram 构建失败（alias 缺失 + 配置补全）

### P1 — 影响审核/体验

6. 内容页实现分享能力（`useShareAppMessage`）— template/detail、work-detail、benchmark/detail
7. 通知中心入口从"即将上线"改为跳转通知列表页（接口已就绪）
8. 各页面动态设置导航标题（`Taro.setNavigationBarTitle`）
9. 修复部分列表页缺少分页/下拉刷新问题（benchmark 历史、billing/transactions、billing/orders）
10. 积分状态去重：统一由 `points.store` 管理，`User` 对象不存储 `currentPoints`

## Impact

- Affected specs: 小程序上线就绪
- Affected code:
  - `apps/miniprogram/config/index.ts` — alias 配置 + 域名环境变量
  - `apps/miniprogram/` — 新增 project.config.json / sitemap.json
  - `apps/miniprogram/src/hooks/useWebSocket.ts` — WS_BASE_URL 环境变量化
  - `apps/miniprogram/src/services/token.ts` — API_BASE_URL fallback
  - `apps/miniprogram/src/services/request.ts` — API_BASE_URL fallback
  - `apps/miniprogram/src/utils/capabilities.ts` — 新增平台枚举常量
  - 4 个页面（recommend/gallery/publish-template/benchmark）— 平台枚举统一
  - 3 个内容页 — 分享能力
  - 3 个列表页 — 分页/下拉刷新
  - 3 个 store 文件 — 积分去重

## ADDED Requirements

### Requirement: 小程序项目配置

The system SHALL provide `project.config.json` 和 `sitemap.json` 文件，使微信开发者工具能够正确导入和构建项目。

#### Scenario: 开发者工具导入

- **WHEN** 开发者用微信开发者工具导入 `apps/miniprogram/` 目录
- **THEN** 工具应能识别项目配置，正常显示 appid、项目名称等信息

### Requirement: 域名环境变量化

The system SHALL 将 API_BASE_URL 和 WS_BASE_URL 通过 Taro defineConstants 环境变量注入，支持开发/测试/生产环境切换。

#### Scenario: 生产构建

- **WHEN** `NODE_ENV=production` 时构建小程序
- **THEN** API_BASE_URL 应使用 https 协议的生产域名，WS_BASE_URL 应使用 wss 协议

### Requirement: 平台枚举统一

The system SHALL 在 `capability` 中定义统一的平台枚举常量，所有页面引用同一常量；枚举值 SHALL 使用后端兼容的大写枚举值（如 `DOUYIN`、`XIAOHONGSHU`）。

#### Scenario: 发布模板

- **WHEN** 用户在发布模板页面选择平台"抖音"
- **THEN** 提交到后端的 platform 值应与 gallery 筛选页使用的值一致

### Requirement: 分享能力

The system SHALL 在内容页实现 `useShareAppMessage`，支持分享到微信聊天和朋友圈。

#### Scenario: 分享模板详情

- **WHEN** 用户在模板详情页点击分享
- **THEN** 应弹出微信原生分享面板，分享标题为模板名称，图片为模板封面

## MODIFIED Requirements

### Requirement: 构建配置

原本缺失 `@reelclone/capability` 别名，现已在 Taro 构建配置的 `alias` 中补充。

## REMOVED Requirements

### Requirement: 通知中心"即将上线"占位

**Reason**: 通知 API 接口已就绪，不应再显示占位提示
**Migration**: 改为跳转通知列表页面
