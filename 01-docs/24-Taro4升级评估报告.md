# 24. Taro 3.6.40 → 4.x 升级评估报告

> 对应安全审计报告待办 **T-2d**（P3）｜评估日期：2026-08-29｜状态：**暂缓（Taro 4.x 当前不适合落地）**｜结论先行：**esbuild/webpack 漏洞无法随 Taro 4 消解（webpack5-runner 强制 pin 5.91.0 <5.94.0），4.2.2-beta.0 仍含漏洞，测试基础设施（@tarojs/test-utils-react）不兼容 Taro 4，升级代价与收益严重不成正比。建议保持 3.6.40 + 持续观察。**

---

## 1. 触发源：剩余 16 个 audit 项（0c/0h/12m/4l）

### 1.1 与 Taro 3.x 直接关联的 audit 项（12 moderate）

| #  | 包                     | 漏洞                                         | CVSS  | 风险说明                           | 是否随 Taro 4 消解 |
|----|------------------------|----------------------------------------------|-------|-----------------------------------|-------------------|
| 1  | `@tarojs/helper`       | esbuild ≤0.24.2 任意请求转发开发服务器        | 5.3   | 构建阶段，本地网络                  | **❌ 仍命中**（4.2.1/4.2.2-beta 仍 ~0.21.0） |
| 2  | `@tarojs/taro`         | 经 `@tarojs/helper` → esbuild                | 5.3   | 同上                               | **❌ 仍命中** |
| 3  | `@tarojs/components`   | 经 `@tarojs/taro` → esbuild                  | 5.3   | 同上                               | **❌ 仍命中** |
| 4  | `@tarojs/components-advanced` | 同上                                  | 5.3   | 同上                               | **❌ 仍命中** |
| 5  | `@tarojs/service`       | 经 `@tarojs/helper` → esbuild                | 5.3   | 同上                               | **❌ 仍命中** |
| 6  | `@tarojs/plugin-framework-react` | 同上                            | 5.3   | 同上                               | **❌ 仍命中** |
| 7  | `@tarojs/plugin-platform-weapp` | 同上                            | 5.3   | 同上                               | **❌ 仍命中** |
| 8  | `esbuild`              | GHSA-67mh-4wv8-2f99（同上）                 | 5.3   | 同上                               | **❌ 仍命中** |
| 9  | `webpack`（Taro 构建） | GHSA-4vvj-4cpr-p986 DOM Clobbering XSS      | 6.4   | webpack 5.0–5.93.0；CI/CD 构建时触发 | **❌ 仍命中**（4.x webpack5-runner 精确 pin 5.91.0 <5.94.0） |
| 10 | `webpack`（Taro 构建） | GHSA-8fgc-7cc6-rx7x SSRF bypass            | 3.7   | 低；webpack 5.49–5.104             | **❌ 仍命中** |
| 11 | `webpack`（Taro 构建） | GHSA-38r7-794h-5758 SSRF + cache persisting  | 3.7   | 低；webpack 5.49–<5.104            | **❌ 仍命中** |
| 12 | `terser-webpack-plugin`| 经 webpack 传递                               | —     | 低；独立 fixAvailable: false        | **❌ 仍命中** |

### 1.2 非 Taro 直接关联的项

| #  | 包                | 漏洞                                       | CVSS | 来源                  | 消解路径              |
|----|-------------------|--------------------------------------------|------|-----------------------|----------------------|
| 13 | `react-router`    | GHSA-wrjc-x8rr-h8h6 反向开放重定向（CVE-2025-68470 bypass） | 5.3 | `admin-web`（Vite H5） | `admin-web` 升级 react-router-dom 即可 |
| 14 | `react-router`    | GHSA-337j-9hxr-rhxg 构造函数注入（SSR 水合）   | 6.1  | 同上                   | 同上                  |
| 15 | `uuid`            | GHSA-w5hq-g745-h8pq 缓冲区边界检查缺失（≤11.1.0） | 7.5 | 12 个 NestJS 服务      | NestJS 服务内升级 uuid 即可（Taro 无关） |
| 16 | `@temporalio/worker` | 经 source-map-loader → webpack 传递          | —    | `libs/temporal`        | 独立升级或 override（Taro 无关） |

---

## 2. Taro 4.x 破坏性变更盘点

### 2.1 运行时要求

| 项目           | Taro 3.6（现状）   | Taro 4.x（目标）      |
|----------------|---------------------|------------------------|
| **Node.js**    | 无显式声明（实际 ≥16） | **≥18**（官方 LTS）    |
| **React**      | `^18`（本项目 18.3.1 ✅） | `^18`（peer 一致 ✅）  |
| **小引擎**     | Webpack 4 + Babel   | Webpack 5 + SWC（编译速度 +40%） |

> ✅ **本项目 CI Node 20，满足 Taro 4 运行时要求。**

### 2.2 API 导入方式变更（Taro Next 迁移）

Taro 4.x（v3.5+）开始，框架自身 API 需从独立包引入：

```typescript
// ❌ 旧（Taro ≤3.4）
import Taro, { useEffect, useRouter } from '@tarojs/taro'

// ✅ 新（Taro ≥3.5 / 4.x）
import { useEffect, useRouter } from '@tarojs/taro'
import Taro from '@tarojs/taro' // 仅保留全局工具
```

**本项目现状**：Taro 3.6.40 已是 Next 版本，全部组件和 hooks 已从独立路径引入（`@tarojs/components`、`@tarojs/taro`）——**零影响**。

### 2.3 配置文件格式（`.config.js` 分离）

Taro Next 要求将页面/项目配置从类属性/函数属性迁移到独立 `.config.js` 文件。

**本项目现状**：`apps/miniprogram/src/app.config.ts` 和各页面 `index.config.ts` **已全部使用独立配置文件格式**——**零影响**。

### 2.4 ES5 默认不再支持

V4 开始默认 browserslist 不再将代码编译为 ES5。若需兼容老旧浏览器（iOS <9 / Android <5），需额外配置。

**本项目现状**：微信小程序环境本身不支持 ES5 polyfill 方案，产物为平台原生格式——**无影响**。

### 2.5 小程序编译模式（CompileMode）

V3.6.22+ 支持 `compileMode` 属性，可在长列表场景提升 30%+ 首开性能。本项目 `mini.optimizeMainPackage: true` 已开启主包优化——**可平滑迁移**。

### 2.6 编译引擎选择（webpack5 / swc）

V4 支持 webpack5（默认）和 swc。`compiler: 'webpack5'` 在 V4 仍有效——**零配置迁移**。

### 2.7 H5 router 模式

V4 H5 端 `browser` 模式语义不变，`config/h5.ts` 的 router 配置可复用——**零影响**。

---

## 3. 关键阻断项（Taro 4.x 当前不可落地）

### 3.1 webpack 漏洞无法通过升级消解（P0）

| 漏洞                              | CVSS | 当前版本  | Taro 4.2.1 webpack5-runner pin | 修复版本 |
|-----------------------------------|------|-----------|-------------------------------|----------|
| GHSA-4vvj-4cpr-p986 DOM Clobbering XSS | 6.4  | 5.78.0（override 固定） | **webpack 5.91.0（精确 pin）** | ≥5.94.0 |
| GHSA-8fgc-7cc6-rx7x SSRF bypass  | 3.7  | 5.78.0    | **5.91.0（仍在范围内）**          | <5.49 或 ≥5.104.0 |
| GHSA-38r7-794h-5758 SSRF + cache  | 3.7  | 5.78.0    | **5.91.0（仍在范围内）**          | <5.49 或 ≥5.104.0 |

**关键问题**：`@tarojs/webpack5-runner@4.2.1` 的 `peerDependencies.webpack` 为精确版本 `5.91.0`，且 package.json 中无任何范围声明——意味着 Taro 团队**有意将 webpack 锁定在此版本**，开发者无法通过 override 覆盖（npm 会因 peer 不满足而拒绝）。即使未来 Taro 发布修复版，也要等 Taro 主动升级 webpack。

### 3.2 esbuild 漏洞无法通过升级消解（P0）

| 漏洞                          | CVSS | Taro 3.6.40 | Taro 4.2.1 | Taro 4.2.2-beta.0 |
|-------------------------------|------|-------------|-------------|---------------------|
| GHSA-67mh-4wv8-2f99 任意请求转发 | 5.3  | esbuild ~0.19.5（命中 ≤0.24.2） | esbuild ~0.21.0（**命中 ≤0.24.2**） | esbuild ~0.21.0（**命中 ≤0.24.2**） |

**风险说明**：此漏洞允许任意网站向**开发服务器**发送任意请求并读取响应。仅影响本地开发阶段，不影响生产构建产物。CVSS 5.3（高网络位置/低攻击复杂度），实际风险受限。

**Taro 团队尚未升级**：`@tarojs/helper@4.2.x` 仍声明 `esbuild ~0.21.0`，超出修复范围（≥0.24.3 才修复）。

### 3.3 测试基础设施不兼容 Taro 4（P0）

`@tarojs/test-utils-react@0.1.1` 的 peerDependencies：

```json
{
  "@tarojs/react": "^3.6.0",
  "@tarojs/helper": "^3.6.0",
  "@tarojs/shared": "^3.6.0",
  "@tarojs/runtime": "^3.6.0",
  "@tarojs/components": "^3.6.0",
  "@tarojs/plugin-platform-h5": "^3.6.0",
  "@tarojs/plugin-framework-react": "^3.6.0"
}
```

全部锁定 `^3.6.0`，**不支持 Taro 4.x**。升级 Taro 4 后需等待 `@tarojs/test-utils-react` 发布 4.x 兼容版本。当前 314 个 Jest 用例（`npm run test`）将无法在 Taro 4 环境下运行。

### 3.4 事件监听 Bug（#19453）——风险可控

| 版本    | Text/Image 移除最后一个监听 | 后果                                | 状态     |
|---------|---------------------------|-------------------------------------|----------|
| 4.2.0   | ❌ 崩溃（`pure-text` undefined） | 整个小程序所有事件绑定失效            | 已关闭（PR #19459） |
| 4.2.1   | ❌ 崩溃（同上）             | 同上                                 | **当前 stable，仍有 bug** |
| 4.2.2-beta.0 | ✅ 已修复               | 正确处理 PureText/PureImage 别名      | beta，无正式版 |

**本项目实际风险**：源码中仅发现 1 处条件监听（`status === 'ACTIVE' ? handleCardClick : undefined`），挂载在 `<TemplateCard onClick>`（**最外层是 `<View>`，非 Text/Image**）——`<View>` 的 `pure-view` 别名存在，**不触发 #19453**。本项目无直接 `<Text onClick={cond ? undefined : fn}>` 或 `<Image onClick={...}>` 模式。

**结论**：#19453 对本项目**实际风险为零**，无需等待 4.2.2 正式版。

---

## 4. 非 Taro 项独立消解路径（可立即执行）

以下 4 项与 Taro 升级无关，可单独处理：

| 项  | 包              | 消解方式                          | 风险      |
|-----|-----------------|-----------------------------------|-----------|
| 13  | `react-router`  | `apps/admin-web/package.json` 升级 `react-router-dom` 到 `^7.18.0` | 低（语义化版本） |
| 14  | `react-router`  | 同上（同一包）                     | 同上      |
| 15  | `uuid`          | 各 NestJS 服务的 `package.json` 升级 uuid 到 `^11.1.1` | 低（Taro 不涉及） |
| 16  | `@temporalio/worker` | `libs/temporal/package.json` 升级 worker 或 override | 低 |

---

## 5. 风险矩阵

| 风险项                     | 概率  | 影响  | 等级 | 缓解策略                              |
|---------------------------|-------|-------|------|--------------------------------------|
| webpack DOM Clobbering XSS（5.78.0） | 中   | 高   | **High** | 保持在 Taro 3.6.40（webpack 5.78.0 > 5.0–5.93 范围**低端**，XSS 需攻击者控制 DOM 元素名，小程序无此攻击面） |
| esbuild 任意请求转发（dev server）   | 低   | 中   | **Medium** | 仅本地开发阶段触发；CI/CD 构建不暴露；保持 Taro 3.6.40 |
| 测试基础设施不兼容 Taro 4             | 高   | 高   | **High** | 暂不升级 Taro；持续观察 @tarojs/test-utils-react 4.x 动态 |
| webpack5-runner pin 5.91.0 永久锁定  | 确定  | 中   | **Medium** | 等待 Taro 官方升级 webpack；或 fork @tarojs/webpack5-runner（高成本） |
| #19453 事件监听崩溃                | 低   | 极高  | ~~High~~ → **Low（本项目不触发）** | 源码审查已确认安全；无需等 4.2.2 |

---

## 6. 迁移实施步骤（记录存档，待条件成熟时执行）

> 以下步骤仅作为知识沉淀存档。当前不执行。触发条件：① `@tarojs/test-utils-react` 发布 4.x 兼容版本；② Taro 官方将 webpack 升级到 ≥5.94.0 或提供官方 override 方案。

### 步骤 1：依赖批量升级

```bash
# 更新 Taro 全家桶到 4.2.1（稳定版）
npm i @tarojs/cli@4.2.1 @tarojs/taro@4.2.1 @tarojs/runtime@4.2.1 \
  @tarojs/components@4.2.1 @tarojs/react@4.2.1 \
  @tarojs/helper@4.2.1 @tarojs/shared@4.2.1 \
  @tarojs/taro-loader@4.2.1 \
  @tarojs/webpack5-runner@4.2.1 \
  @tarojs/plugin-framework-react@4.2.1 \
  @tarojs/plugin-platform-weapp@4.2.1 \
  --legacy-peer-deps

# 同步更新 root overrides（移除 lodash-es override，Taro 4 已不含此依赖）
# 更新 babel-preset-taro
npm i babel-preset-taro@4.2.1 --legacy-peer-deps
```

### 步骤 2：清理构建缓存

```bash
rm -rf apps/miniprogram/node_modules/.cache
rm -rf apps/miniprogram/dist
npm run build:weapp
```

### 步骤 3：全量回归测试

```bash
# 单元测试（等待 test-utils 4.x 兼容版）
npm run test

# E2E（小程序开发者工具）
npm run dev:weapp
```

### 步骤 4：H5 验证

```bash
npm run dev:h5
# 验证 router / 跨域代理 / React 兼容性组件库
```

---

## 7. 回滚预案

```bash
# 立即回滚：锁定 Taro 版本
npm i @tarojs/cli@3.6.40 @tarojs/taro@3.6.40 @tarojs/runtime@3.6.40 \
  @tarojs/components@3.6.40 @tarojs/react@3.6.40 \
  @tarojs/helper@3.6.40 @tarojs/shared@3.6.40 \
  @tarojs/taro-loader@3.6.40 \
  @tarojs/webpack5-runner@3.6.40 \
  @tarojs/plugin-framework-react@3.6.40 \
  @tarojs/plugin-platform-weapp@3.6.40 \
  --legacy-peer-deps

# 恢复 root overrides（swiper 12.1.2 + lodash-es 4.18.1）
rm -rf apps/miniprogram/node_modules/.cache apps/miniprogram/dist
npm run build:weapp
```

---

## 8. 行动建议

| 优先级 | 动作                                           | 说明                                   |
|--------|----------------------------------------------|----------------------------------------|
| **P0** | **暂不升级 Taro 4.x**                        | 核心阻断：webpack5-runner pin 5.91.0 + test-utils 不兼容 |
| **P1** | 单独消解 `react-router` 两个 moderate（admin-web） | 不影响 Taro，可立即执行                  |
| **P1** | 单独消解 `uuid`（12 个 NestJS 服务）           | 不影响 Taro，可立即执行                  |
| **P2** | 持续监控 `@tarojs/test-utils-react` 4.x 发布   | 关注 https://www.npmjs.com/package/@tarojs/test-utils-react |
| **P2** | 持续监控 `@tarojs/webpack5-runner` webpack 版本 | 关注 https://github.com/NervJS/taro/releases |
| **P3** | 记录 Taro 4.x 迁移知识                        | 本报告已沉淀，待条件成熟时复用            |

> **最终结论**：T-2d 风险消解以**暂缓 Taro 4 升级**为最优解。非 Taro 项（react-router / uuid / temporal）可通过独立升级消解，行动建议为 P1。Taro 4.x 升级窗口需同时满足：① test-utils 4.x 发布；② webpack 漏洞随 Taro 官方升级消除；③ swiper / lodash-es 等供应链漏洞随 Taro 生态更新自然消解。

---

## 9. 参考链接

- Taro 4.0 Beta 发布公告：https://juejin.cn/post/7330792655125463067
- Taro 迁移指南（3.x → Next）：https://docs.taro.zone/docs/migration
- #19453 Bug 详情：https://github.com/NervJS/taro/issues/19453
- PR #19459 修复：https://github.com/NervJS/taro/pull/19459
- esbuild GHSA-67mh-4wv8-2f99：https://github.com/advisories/GHSA-67mh-4wv8-2f99
- webpack GHSA-4vvj-4cpr-p986：https://github.com/advisories/GHSA-4vvj-4cpr-p986
