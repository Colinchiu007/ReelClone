# ReelClone 微信小程序

> WouwouAI 微信小程序 1:1 复刻前端，基于 Taro 3.x + React 18 + TypeScript。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 跨端框架 | Taro 3.6.x |
| UI 框架 | React 18 |
| 语言 | TypeScript 5（严格模式） |
| 状态管理 | Zustand |
| 样式方案 | SCSS Modules + 全局变量（sass.resource 自动注入） |
| 构建引擎 | webpack5-runner |
| 主题 | 深色主题（`#0A0B1A` 背景 + 蓝紫渐变品牌色 `#4F46E5` ~ `#7C3AED`） |

## 启动开发

### 1. 安装依赖

在仓库根目录执行：

```bash
npm install
```

### 2. 配置环境变量

```bash
cp apps/miniprogram/.env.example apps/miniprogram/.env
# 按需修改 API_BASE_URL 与 WECHAT_APPID
```

### 3. 启动开发服务器（微信小程序）

```bash
# 方式一：直接 npm 脚本
npm run dev:weapp --workspace apps/miniprogram

# 方式二：Nx 命令（推荐）
npx nx dev:weapp miniprogram

# 方式三：在仓库根目录运行
npx nx run miniprogram:dev:weapp
```

启动后产物输出到 `apps/miniprogram/dist/`，使用微信开发者工具导入该目录即可预览。

### 4. 构建生产包

```bash
npx nx build:weapp miniprogram
```

### 5. 代码检查与类型检查

```bash
# 单项目
npx nx lint miniprogram
npx nx typecheck miniprogram

# 全工作区
npm run lint
npm run typecheck
```

## 目录结构

```
apps/miniprogram/
├── config/                     # Taro 构建配置
│   ├── index.ts                # 主配置（设计稿、SCSS 注入、路径别名、分包优化）
│   ├── dev.ts                  # 开发环境覆盖配置
│   └── prod.ts                 # 生产环境覆盖配置
├── src/
│   ├── app.ts                  # 应用入口（函数组件，无 JSX）
│   ├── app.config.ts           # 全局配置（页面、分包、TabBar、预加载、深色主题）
│   ├── app.scss                # 全局样式入口
│   ├── theme.json              # 深色/浅色主题变量
│   ├── assets/
│   │   └── tab/                # TabBar 图标（需手动添加 PNG）
│   ├── pages/                  # 业务页面
│   │   ├── home/               # 主包：首页
│   │   ├── recommend/          # 主包：灵感广场
│   │   ├── benchmark/          # 主包：对标解析
│   │   ├── mine/               # 主包：我的
│   │   ├── workbench/          # 分包：工作台（文本/图片/视频生成等）
│   │   ├── asset/              # 分包：我的资产
│   │   ├── billing/            # 分包：套餐积分
│   │   ├── settings/           # 分包：设置
│   │   └── template/           # 分包：灵感模板
│   └── styles/
│       ├── variables.scss      # SCSS 全局变量（品牌色、背景、文字、间距等）
│       ├── mixins.scss         # SCSS Mixins（flex-center、ellipsis、safe-area 等）
│       └── global.scss         # 全局样式重置（box-sizing、滚动条等）
├── babel.config.js             # Taro Babel 预设
├── project.json                # Nx 项目配置
├── tsconfig.json               # TypeScript 配置（继承根 tsconfig.base.json）
├── package.json                # 子包依赖
└── .env.example                # 环境变量示例
```

## 分包策略

主包仅包含 4 个 TabBar 页面，确保首屏加载速度；其他页面按业务模块分包：

| 分包 | 路径 | 包含页面 | 用途 |
| --- | --- | --- | --- |
| 主包 | - | home / recommend / benchmark / mine | TabBar 主入口 |
| 工作台 | `pages/workbench` | text、image、video-text、video-image-first、video-image-first-last、video-edit、video-extend、works、work-detail | AI 生成核心业务 |
| 资产 | `pages/asset` | index、avatar-groups、avatar-group-create | 素材库与真人形象组 |
| 套餐 | `pages/billing` | subscribe、my-package、transactions、orders | 订阅与积分 |
| 设置 | `pages/settings` | index、about、privacy | 账户与隐私 |
| 模板 | `pages/template` | gallery、detail、my-templates | 灵感模板 |

### 分包预加载策略

- 进入 `pages/home/index` → 预加载 `pages/workbench`（首页即创作入口）
- 进入 `pages/mine/index` → 预加载 `pages/asset` + `pages/billing`（我的页常访问资产与套餐）

配置见 `src/app.config.ts` 的 `preloadRule` 字段。

## 关键设计决策

1. **SCSS 全局变量注入**：通过 `config/index.ts` 的 `sass.resource` 配置，自动将 `variables.scss` 和 `mixins.scss` 注入每个 SCSS 文件，无需手动 import。
2. **路径别名**：`@/` 映射到 `apps/miniprogram/src/`，在 `tsconfig.json` 与 `config/index.ts` 中同步配置。
3. **深色主题**：`app.config.ts` 中 `darkmode: true`，通过 `theme.json` 定义深浅色变量；当前深色为默认主题。
4. **SCSS Modules**：开启 `cssModules`，命名规则 `[name]__[local]___[hash:base64:5]`，避免样式冲突。
5. **设计稿尺寸**：750 × 1334（iPhone 6），`designWidth: 750`，开发时使用 `px` 单位，Taro 自动转换为 `rpx`。
6. **TypeScript 严格模式**：继承根 `tsconfig.base.json` 的严格设置，并显式关闭 `experimentalDecorators`（小程序无需装饰器元数据）。
7. **app.ts 使用 .ts 扩展名**：应用入口无 JSX，仅返回 `children`，符合 Taro 3.x React 函数组件规范。

## TabBar 图标

由于脚手架阶段未生成真实 PNG，需在 `src/assets/tab/` 下手动添加 8 个图标文件（81×81px PNG），详见 `src/assets/tab/README.md`。
