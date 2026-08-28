# 23. NestJS 10 → 11 升级评估报告

> 对应安全审计报告待办 **T-1**（P1）｜评估日期：2026-08-28｜评估人：AI 助手 + 项目记忆
> 结论先行：**升级窗口成熟（建议发布后专项执行），当前 advisory 在本项目不可利用，无上线阻断风险。**

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

## 4. 配套包兼容矩阵

| 包                                                         | 当前实际版本（root override 锁定） | NestJS 11 目标版本                        | 说明                                |
| ---------------------------------------------------------- | ---------------------------------- | ----------------------------------------- | ----------------------------------- |
| `@nestjs/core` / `common` / `platform-express` / `testing` | 10.4.22                            | **≥ 11.1.18**（= 触发 advisory 的修复线） | 核心升级                            |
| `@nestjs/config`                                           | 3.3.0                              | ^4.0.0                                    | v4 才支持 Nest 11 的 peer 范围      |
| `@nestjs/swagger`                                          | ^7.4.0（libs/swagger）             | ^11.x（11.1.x 已稳定）                    | `@nestjs/mapped-types` 自动连带升级 |
| `@nestjs/typeorm`                                          | 10.0.2                             | ^11.0.3                                   | 11.0.0+ 对齐 Nest 11                |
| `@nestjs/schedule`                                         | ^4.1.2（billing/template）         | ^5.x                                      | 对齐 ToExpression Nest 11           |
| `@nestjs/jwt`                                              | 10.2.0                             | ^11.x                                     | 配合 passport                       |
| `@nestjs/passport`                                         | 10.0.3                             | ^11.x                                     |                                     |
| `@nestjs/websockets` / `@nestjs/platform-socket.io`        | 10.4.22（notification）            | ^11.x                                     |                                     |
| `rxjs`                                                     | ^7.8.1                             | 7.x 不变                                  | 兼容                                |
| `typeorm`                                                  | ^0.3.20                            | 0.3.x 不变                                | 兼容                                |
| `typescript`                                               | ^5.5.4                             | ≥5.6                                      | v11 要求                            |

其余（reflect-metadata、class-validator 等）无版本耦合。

---

## 5. 升级实施计划（建议）

**窗口**：上线后专项（发布后 1-2 周内，与 T-2b「随 Taro 4.x」错峰，避免同窗口双大版本升级）。

### 步骤

1. **分支**：`feature/nestjs-11-upgrade`（基于 master）。
2. **依赖声明调整**（全仓 10 个后端 app + libs）：
   - 各 `apps/*/package.json`、`libs/*/package.json` 中 `@nestjs/*` 由 `^10.x` 提升至 `^11.1.18`（websockets/platform-socket.io/config/swagger/typeorm/schedule 按 §4 目标值）。
   - **移除 root `overrides` 中全部 `@nestjs/*` 锁定项**（L-037 的历史锁定使命由直接声明取代）。
   - 清理历史 `|| ^11.0.0` 残留写法（本次统一为精确 `^11.x`）。
3. **安装**：`npm install --legacy-peer-deps` 强制重解析（沿 L-073/L-074 经验，registry 用官方源做 audit 校验）。
4. **代码微调**（如需要）：
   - `libs/common/src/bootstrap.service.ts`：如需保留 qs 嵌套查询能力，在 `NestExpressApplication` 上补 `app.set('query parser', 'extended')`。
   - 启动日志出现 `LegacyRouteConverter ... Unsupported route path` WARN 时按告警逐一改成命名通配符（本项目实测应不会出现）。
5. **全链验证（重要）**：
   - `npm run lint` ＋ `npm run typecheck`
   - `npm run build:libs && npm run build`
   - `npm run test:unit:coverage`（覆盖率门禁 50/33/35/50）
   - `npm run test:miniprogram:coverage`（70/55/70/70，确认能力层/类型生成未受 Nest 影响）
   - `npm run test:e2e`（5 API + 5 Flows 全绿）
   - `npm run build` 全量 Docker 镜像构建（11 个）
   - `npm audit --omit=dev --registry=https://registry.npmjs.org`：确认 **@nestjs/core advisory 消失**；SV 二次核 `npm ls @nestjs/core`
   - `npm run gen:types:check`：Swagger 元数据若变化则重新提取 OpenAPI 生成前端类型
6. **灰度发布**：云托管按服务分组滚动（先 auth/user 无状态边缘服务，最后 billing/order 核心）。
7. **回滚预案**：`git revert` 升级提交 → 重建镜像 → 重发上一版本；JWT/密钥无需更换（框架层变更不涉及凭据）。

### 风险登记

| 风险                               | 等级               | 缓解                                                                  |
| ---------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Express 5 路径匹配行为差异导致 404 | 低（无通配符路由） | E2E 覆盖全部 API 路径                                                 |
| qs→simple 查询解析                 | 低（无嵌套参数）   | 启动前加 `extended` 兜底即可                                          |
| 动态模块去重变更引发重复初始化     | 中                 | 升级分支上专项核对 `ServiceConfigModule.forRoot` 各服务仅一处全局导入 |
| `@nestjs/schedule` v4→v5 行为差异  | 低                 | billing/template 定时任务 E2E 覆盖                                    |
| 小程序/能力层依赖残留 Nest 关联    | 低                 | 全量 CI 14 job 验证                                                   |

---

## 6. 结论

1. **安全性**：GHSA-36xv-jgw5-4q75 在本项目**不可利用**（无 SSE），不构成上线阻断；但 10.x 全系无补丁，`npm audit` 会持续标记，且框架停在 10.x 将错过 v11 的后续安全/性能修复（Express 5、模块解析优化、启动提速）。
2. **代码成本**：本项目影响面小 —— 无通配路由、无 SSE、无嵌套查询参数，主要成本 = 依赖版本调整 + 全链验证，估计代码改动集中在 package.json 与 bootstrap 一行配置。
3. **窗口**：建议**上线后专项（1-2 周内）**执行，与 T-2b（Taro 4.x）错峰。升级后更新本报告为"已完成"，并把 §4 目标版本回填实际值。

**升级决策：批准推进（发布后窗口）。T-1 从"待评估"转"方案就绪"状态。**
