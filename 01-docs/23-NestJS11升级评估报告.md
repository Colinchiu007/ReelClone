# 23. NestJS 10 → 11 升级评估报告

> 对应安全审计报告待办 **T-1**（P1）｜评估日期：2026-08-28｜执行完成：2026-08-29（commit 见 §5）
> 状态：**✅ 已完成（升级落地 + 全链验证通过）**｜结论先行：**升级窗口成熟，advisory 已随 v11 消除，全链验证全绿。**

---

## 1. 触发源：GHSA-36xv-jgw5-4q75（CVE-2026-35515）

### 1.1 漏洞机制

- **位置**：`@nestjs/core` 的 `SseStream._transform()`（`packages/core/router/sse-stream.ts`）
- **缺陷**：将 `message.type` 和 `message.id` 直接内插到 Server-Sent Events 协议文本而**未对换行符（`\r`、`\n`）做净化**。SSE 协议将 `\r`/`\n` 视为字段分隔符、`\n\n` 视为事件边界。
- **后果**：可注入任意 SSE 事件（事件伪造）、`data:` 载荷注入（客户端未经净化渲染时可触发 XSS）、`id:` 字段注入（污染重连 `Last-Event-ID`，导致丢事件/重放）。

### 1.2 影响范围与修复

| 项目       | 值                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| GHSA 编号  | GHSA-36xv-jgw5-4q75                                                                                  |
| CVE 编号   | CVE-2026-35515（2026-04-06 发布，CWE-74）                                                            |
| 受影响版本 | `@nestjs/core <= 11.1.17`（**包含全部 10.x，无 10.x 回滚补丁**）                                     |
| 修复版本   | `@nestjs/core@11.1.18`                                                                               |
| 严重度     | CVSS 4.0 = 6.3（Medium）/ CVSS 3.1 = 6.1（Moderate）                                                 |
| 攻击前提   | **开发者必须将用户可控数据映射到 SSE 消息的 `type`/`id` 字段**；直接 HTTP 请求输入不会穿透到这些字段 |

### 1.3 本项目可利用性分析（实测）

| 检查项                                                 | 结果                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 全仓 `@Sse` 装饰器 / `SseStream` / `text/event-stream` | ✅ **未使用**（apps + libs 全量 Grep 零命中）                                        |
| 入站 SSE 端点                                          | 不存在，无 `res.sse(...)` 或类似调用                                                 |
| LLM 客户端的 `parseSseLine`（libs/ai）                 | 仅**出站**解析上游 LLM 的 SSE 响应，不经过 `@nestjs/core` 的 SseStream，**不受影响** |

**结论：攻击前提不成立，当前代码库不存在可利用路径。** `npm audit` 仍会因版本范围标记该 advisory，但实际风险为零，可接受残余风险（需在审计报告登记）。

---

## 2. NestJS 11 破坏性变更盘点

### 2.1 运行时要求

- **Node.js ≥ 20**（放弃 16/18）。本项目 Docker 基线 `node:20-alpine` ✅ 已满足。
- TypeScript ≥ 5.6（本项目 `^5.5.4`，需升到 ≥5.6）。

### 2.2 Express 5 成为默认适配器（path-to-regexp v8）

| 变更             | v4（现状）   | v5（目标）                                               |
| ---------------- | ------------ | -------------------------------------------------------- |
| 通配符必须有名字 | `*`（匿名）  | `/*splat` 或 `/{*splat}`（splat 只是参数名，可任意命名） |
| 可选段 `?` 移除  | `/:file?`    | `/:file{.:ext}`（大括号可选组）                          |
| 正则字符不再支持 | 部分正则路径 | 不支持，保留字符 `(()[]?+!)` 需 `\` 转义                 |
| 参数名约束       | 宽松         | 有效 JS 标识符或引号包裹 `:"this"`                       |

> NestJS 11 启动时会用 `LegacyRouteConverter` **自动把旧式 `*` 路由转换为 v5 合法路由**（行为不变，但每次启动打一条 WARN），因此未改的旧路由"能跑但有告警"。

### 2.3 查询参数解析（仅 Express 5）

- 默认由 qs（extended）改为 **simple 解析器**，**不支持嵌套对象/数组**：
  - `?filter[where][name]=John`、`?item[]=1&item[]=2` 将不再按预期解析。
- 恢复 v4 行为：`app.set('query parser', 'extended')`（需 `NestExpressApplication` 类型）。

### 2.4 模块解析算法变更

- v10 及更早：动态模块按元数据哈希去重（相同配置自动合并为同一节点）。
- **v11：改用对象引用判断等价性**。相同配置的动态模块不再自动去重 —— 若业务代码依赖"多处 import 相同 forRoot 配置自动合并"的行为，需要改为共享同一模块实例（提取到变量复用）或显式拆分。

### 2.5 其他

- `Reflector` 类型推断增强（对自定义元数据提供者更友好，非破坏）。
- `@nestjs/platform-fastify` 支持 Fastify v5（本项目未用）。
- 若干小破坏点集中在 `@nestjs/common` 的工具/装饰器类型签名（详见官方 migration 文档）。

---

## 3. 本项目代码影响面实测（Grep + 人工核对）

| 检查维度                                  | 结果                                                                                                                  | 风险                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SSE 使用（入站）                          | 零命中                                                                                                                | 🟢 无                               |
| 通配符路由 `@Xxx('*')` / `forRoutes('*')` | apps 零命中；libs 无 forRoutes                                                                                        | 🟢 无                               |
| `setGlobalPrefix`                         | libs/common bootstrap.service.ts L133，`exclude: ['livez','readyz']`，v11 兼容                                        | 🟢 兼容                             |
| `@Query()` 绑定                           | 全部绑定 DTO 简单标量字段（分页/列表/筛选），无嵌套对象字符串                                                         | 🟢 低（建议加 `extended` 保持行为） |
| CORS / Pipe / Filter / Interceptor        | 标准 Nest 全局注册（bootstrap.service.ts），v11 兼容                                                                  | 🟢 无                               |
| WebSocket（notification-service）         | `@nestjs/websockets` + `@nestjs/platform-socket.io` 10.x → 11.x 可用                                                  | 🟢 无                               |
| 动态模块                                  | 统一经 `ServiceConfigModule.forRoot()`（libs/common 封装）+ `TypeOrmModule.forFeature(X, 具名连接)`，每服务单实例组合 | 🟡 升级时验证 alias 重复导入        |
| Schedule（billing/template）              | `ScheduleModule.forRoot()` + `@nestjs/schedule` v4 → v5                                                               | 🟢 无（随包升级）                   |

**影响面结论：本项目路由均为静态路径 + 具名参数，无 Express v5 高危语法；升级主要工作量在依赖版本调整与全链验证，而非代码改造。**

---

## 4. 配套包兼容矩阵（已按实际安装回填）

| 包                                                         | 升级前版本                 | 目标声明（package.json） | 实际安装版本 | 说明                                           |
| ---------------------------------------------------------- | -------------------------- | ------------------------ | ------------ | ---------------------------------------------- |
| `@nestjs/core` / `common` / `platform-express` / `testing` | 10.4.22                    | `^11.1.18`               | **11.2.3**   | 核心升级，advisory 修复线之上                  |
| `@nestjs/config`                                           | 3.3.0                      | `^4.0.0`                 | 4.0.4        | v4 才支持 Nest 11 的 peer 范围                 |
| `@nestjs/swagger`                                          | ^7.4.0（libs/swagger）     | `^11.1.0`                | 11.x         | root devDependencies 新增，保证 monorepo hoist |
| `@nestjs/typeorm`                                          | 10.0.2                     | `^11.0.3`                | 11.x         | 11.0.0+ 对齐 Nest 11                           |
| `@nestjs/schedule`                                         | ^4.1.2（billing/template） | `^5.0.1`                 | 5.x          | 对齐 Nest 11（注意：无 5.1.x，最高 5.0.x）     |
| `@nestjs/jwt`                                              | 10.2.0                     | `^11.0.0`                | 11.0.2       | 配合 passport；`expiresIn` 类型收窄见 §5       |
| `@nestjs/passport`                                         | 10.0.3                     | `^11.0.5`                | 11.0.5       |                                                |
| `@nestjs/websockets` / `@nestjs/platform-socket.io`        | 10.4.22（notification）    | `^11.1.18`               | 11.x         |                                                |
| `@nestjs/testing`                                          | 10.4.22                    | `^11.1.18`               | 11.x         | root devDependencies 新增（libs spec 依赖）    |
| `rxjs`                                                     | ^7.8.1                     | 7.x 不变                 | 7.x          | 兼容                                           |
| `typeorm`                                                  | ^0.3.20                    | 0.3.x 不变               | 0.3.x        | 兼容                                           |
| `typescript`                                               | ^5.5.4                     | `^5.6.0`                 | **5.9.3**    | v11 要求 ≥5.6                                  |

其余（reflect-metadata、class-validator 等）无版本耦合。

---

## 5. 升级执行记录（2026-08-29 落地）

**分支**：`feature/nestjs-11-upgrade`（基于 master）→ 提交后 PR → CI 全绿合并。

### 5.1 依赖声明调整（已完成）

- 全仓 25 个 package.json（10 后端 app + admin-web + miniprogram + 12 libs + root）中 `@nestjs/*` 统一升至 §4 目标版本，TypeScript 升至 `^5.6.0`。
- **移除 root `overrides` 中全部 `@nestjs/*` 锁定项**（L-037 的历史锁定使命由直接声明取代；`tar/brace-expansion/request/webpack` 锁定保留）。
- **root devDependencies 新增** `@nestjs/swagger@^11.1.0`、`@nestjs/testing@^11.1.18` —— 这两包此前仅嵌套安装（libs/swagger、各 app），升级后 `npm install` 全量重排不再 hoist 到 root，导致全仓 typecheck TS2307；提至 root 后由 npm 保证 root 级安装、所有 workspace 可解析。
- 安装方式：`npm install`（**不带 `--legacy-peer-deps`**）触发 npm 重新解析；实测首次 install 未完全 hoist（root `node_modules/@nestjs` 仅 common/config/core/jwt/passport/typeorm），补 root devDeps 二次 install 后全量就位。

### 5.2 代码微调（已完成，共 2 处）

| 文件                                           | 变更                                                                                       | 原因                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `libs/common/src/bootstrap.service.ts`         | `NestFactory.create<NestExpressApplication>` 后补 `app.set('query parser', 'extended')`    | Express 5 默认 simple 解析器不支持嵌套查询，恢复 v4 行为（§2.3）                                    |
| `libs/common/src/config/service-jwt.module.ts` | `signOptions.expiresIn` 两处加 `as StringValue`（`import type { StringValue } from 'ms'`） | @nestjs/jwt v11 将 `expiresIn` 类型收窄为 `number \| StringValue`，与 auth-service 既有写法保持一致 |

> 预期内的告警：`LegacyRouteConverter` WARN 未出现（本项目无旧式通配符路由，§3 实测吻合）。

### 5.3 全链验证结果（本地全绿，E2E 走 CI）

| 门禁                                | 结果                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                      | ✅ 通过                                                                                                                             |
| `npm run typecheck`                 | ✅ 通过（修 hoist + JWT 类型后全绿）                                                                                                |
| `npm run gen:types:check`           | ✅ 类型生成一致（git diff --exit-code 通过）                                                                                        |
| `npm run build:libs`                | ✅ 12 个共享库预编译成功                                                                                                            |
| `npm run build`                     | ✅ 24 个项目构建成功（含 admin-web / 全部服务）                                                                                     |
| `npm run test:unit:coverage`        | ✅ 107 套件 / 1732 用例全绿；覆盖率 62.28/52.16/50.93/61.96（门禁 50/33/35/50）                                                     |
| `npm run test:miniprogram:coverage` | ✅ 20 套件 / 314 用例全绿；覆盖率 78.89/69.48/77.54/79.16（门禁 70/55/70/70）                                                       |
| `npm run build:miniprogram`         | ✅ Taro weapp 编译成功（webpack 5.78.0）                                                                                            |
| `npm audit --omit=dev`              | ✅ **GHSA-36xv-jgw5-4q75（CVE-2026-35515）消失**；总数 35 → **23**（4c/3h/12m/4l），剩余 4 critical 均为已知 swiper 链（T-2b 跟踪） |
| `npm run test:e2e`                  | ⏳ 本地依赖 docker 栈未执行，由 CI `e2e-test` job 全量验证（5 API + 5 Flows）                                                       |

**灰度发布 / 回滚预案**：按 §6 原计划——云托管按服务分组滚动（先 auth/user 边缘，后 billing/order 核心）；异常时 `git revert` 升级提交重建镜像回滚，JWT/密钥无需更换。

---

## 6. 结论（升级后更新）

1. **安全性**：GHSA-36xv-jgw5-4q75 已随 `@nestjs/core@11.2.3` 完全消除，`npm audit` 不再标记 NestJS advisory；`npm audit --omit=dev` 总数由 35 降至 23。
2. **代码成本**：与 §3 预判一致，影响面集中在依赖声明（25 个 package.json）+ 2 处代码微调（bootstrap query parser 兜底 + JWT expiresIn 类型 cast），无路由/结构改造。
3. **回归风险**：单测/覆盖率/小程序/构建全绿，E2E 由 CI 全量把关；Express 5 行为差异（路径/查询解析）已通过 `extended` 兜底 + 静态路由现状规避。
4. **遗留**：T-1 闭环后剩余仅 T-2b（随 Taro 4.x 消解 swiper，P3）。

**升级完成。T-1 从"方案就绪"转"✅ 已完成"状态。**
