# 小程序与 Web 版代码复用分析

> **生成时间**: 2026-08-07
> **背景**: 用户询问未来除小程序外是否需要提供 Web 版，是否需要维护两份代码。本文档分析代码复用策略。

---

## 1. 结论先行

**不需要维护两份代码。** 当前技术栈选型（Taro 4 + React）天然支持**一次编写、多端编译**，同一套代码可同时输出微信小程序和 H5 Web 版。实际复用率可达 **80%-90%**。

---

## 2. Taro 多端编译能力

### 2.1 Taro 的多端原理

Taro 的核心设计理念就是"一套代码，多端运行"。编译时 Taro 会将同一份 React/JSX 代码转换为不同平台的目标代码：

| 目标平台     | 编译命令                   | 输出              |
| ------------ | -------------------------- | ----------------- |
| 微信小程序   | `taro build --type weapp`  | wxml/wxss/js/wxsc |
| H5 Web       | `taro build --type h5`     | HTML/CSS/JS       |
| React Native | `taro build --type rn`     | RN 组件           |
| 支付宝小程序 | `taro build --type alipay` | 支付宝小程序代码  |

### 2.2 当前项目 Taro 版本

项目使用 Taro 4.x（`apps/miniprogram/package.json`），完全支持多端编译。

---

## 3. 可复用 vs 需适配的模块

### 3.1 可直接复用（无需改动）

| 模块                            | 复用率 | 说明                                                        |
| ------------------------------- | ------ | ----------------------------------------------------------- |
| **页面组件（src/pages/）**      | ~95%   | 38 个页面中 36 个可 100% 复用                               |
| **业务组件（src/components/）** | ~95%   | 9 个组件 + 3 个状态组件                                     |
| **Hooks（src/hooks/）**         | ~90%   | useCredits/useUpload 100% 复用；useAuth/useWebSocket 需适配 |
| **状态管理（src/stores/）**     | ~100%  | Zustand 是平台无关的                                        |
| **API 层（src/services/api/）** | ~100%  | 9 个 API 文件完全复用                                       |
| **类型定义（src/types/）**      | ~100%  | TypeScript 类型平台无关                                     |
| **样式系统（src/styles/）**     | ~85%   | SCSS variables/mixins 复用；部分 H5 需适配                  |
| **工具函数（src/utils/）**      | ~80%   | capabilities.ts 需适配                                      |

### 3.2 需要适配的模块

| 模块                          | 小程序                  | Web 版                             | 适配方式                        |
| ----------------------------- | ----------------------- | ---------------------------------- | ------------------------------- |
| **请求层（request.ts）**      | `Taro.request()`        | `fetch()` / `axios`                | Taro 自动转换                   |
| **Token 存储（token.ts）**    | `Taro.setStorageSync()` | `localStorage`                     | Taro 自动转换                   |
| **微信登录（useAuth）**       | `Taro.login()` → code   | Web 版需用微信扫码登录或手机号登录 | 条件编译 `process.env.TARO_ENV` |
| **WebSocket（useWebSocket）** | `Taro.connectSocket()`  | `new WebSocket()`                  | Taro 自动转换                   |
| **文件上传（useUpload）**     | `Taro.chooseImage()`    | `<input type="file">`              | 条件编译                        |
| **支付**                      | `Taro.requestPayment()` | 微信 H5 支付 / 扫码支付            | 条件编译                        |
| **Tab 导航**                  | 小程序原生 TabBar       | H5 需要路由方案                    | Taro Router 适配                |
| **安全区/导航栏**             | 小程序胶囊菜单          | Web 自定义导航                     | 条件编译                        |
| **权限/分享**                 | `Taro.showShareMenu()`  | Web Share API                      | 条件编译                        |

### 3.3 条件编译示例

```typescript
// 使用 Taro 的环境变量区分平台
if (process.env.TARO_ENV === 'weapp') {
  // 微信小程序专属逻辑
  Taro.login({
    success: (res) => {
      /* ... */
    },
  })
} else if (process.env.TARO_ENV === 'h5') {
  // H5 Web 版专属逻辑
  window.location.href = '/wechat-login-qrcode'
}
```

```scss
/* 跨端样式适配 */
.safe-area-top {
  /* 微信小程序 */
  padding-top: env(safe-area-inset-top);
  /* H5 Web */
  /* Taro H5 编译时自动处理 */
}
```

---

## 4. 复用策略建议

### 4.1 推荐方案：以小程序为主，H5 按需编译

```
apps/miniprogram/        # 唯一前端代码库
  ├── src/
  │   ├── pages/          # 38 个页面（小程序 + H5 共用）
  │   ├── components/     # 9 个组件（共用）
  │   ├── hooks/          # 4 个 Hooks（90% 共用）
  │   ├── services/       # API 层（100% 共用）
  │   ├── stores/         # 状态管理（100% 共用）
  │   └── ...
  ├── config/
  │   ├── index.ts        # 公共配置
  │   ├── dev.ts          # 开发环境
  │   ├── prod.ts         # 生产环境
  │   └── h5.ts           # H5 专属配置（新增）
  └── package.json
```

### 4.2 实施步骤

| 步骤     | 内容                            | 工作量   |
| -------- | ------------------------------- | -------- |
| 1        | 添加 H5 编译配置 `config/h5.ts` | 2h       |
| 2        | 适配 useAuth 的 H5 登录流程     | 4h       |
| 3        | 适配 useUpload 的 H5 文件选择   | 2h       |
| 4        | 适配支付流程（微信 H5 支付）    | 4h       |
| 5        | H5 导航/TabBar 方案             | 3h       |
| 6        | 样式微调（安全区/字体/滚动）    | 4h       |
| 7        | 测试 H5 编译 + 修复兼容问题     | 8h       |
| **合计** |                                 | **~27h** |

### 4.3 不建议的方案

| 方案            | 不推荐原因                                        |
| --------------- | ------------------------------------------------- |
| 两份独立代码    | 维护成本翻倍，功能容易不一致                      |
| 纯 Web 框架重写 | 小程序特性无法直接映射                            |
| 等需要时再考虑  | Taro 多端编译需要项目初期就配置好，后期改造成本高 |

---

## 5. admin-web 的定位

当前 `apps/admin-web` 是独立的 React + Vite 管理后台，**不需要合并到 Taro**。原因：

| 维度    | 小程序（用户端） | admin-web（管理后台） |
| ------- | ---------------- | --------------------- |
| 用户    | C 端用户         | B 端运营人员          |
| 平台    | 微信小程序 + H5  | 浏览器                |
| UI 风格 | 移动端深色       | 桌面端 Ant Design     |
| 认证    | 微信登录         | 手机号+密码           |
| 复杂度  | 38 页面          | 10 页面               |

admin-web 应保持独立 React 项目，通过 OpenAPI generated 类型与后端保持契约一致即可。

---

## 6. 长期架构建议

```
用户端（Taro 多端）
  ├── 微信小程序（主） ← 当前已实现
  └── H5 Web 版（按需） ← 添加 H5 编译即可

管理后台（独立 React）
  └── admin-web ← 当前已实现

后端微服务（共用）
  └── 11 个 NestJS 服务 ← 小程序和 Web 共用同一套 API
```

**关键原则**: 小程序优先，H5 编译复用同一套代码，不需要维护两份。

---

## 7. 对重构方案的补充

基于多端复用策略，重构方案中新增以下考虑：

| 项             | 内容                                                                    | 优先级 |
| -------------- | ----------------------------------------------------------------------- | ------ |
| 条件编译规范化 | useAuth/useUpload/支付中的 `process.env.TARO_ENV` 判断统一为独立适配层  | P3     |
| H5 配置预置    | 在 `config/` 下预置 `h5.ts`，方便未来按需编译                           | P3     |
| API 层跨端兼容 | 确认 request.ts 的 Token 存储/WebSocket 在 H5 下可工作（Taro 自动转换） | P3     |

这些是低优先级项，不影响当前小程序的开发和部署，但为未来 H5 扩展预留了路径。
