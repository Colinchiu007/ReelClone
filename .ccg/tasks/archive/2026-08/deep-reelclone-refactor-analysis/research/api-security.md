# API、认证与安全边界分析

## 1. 范围与结论

- 分析对象是当前仓库中的实时 NestJS 服务、两个前端、Nginx/Compose、OpenAPI 工具和已有测试；本报告不把历史文档、fixture 或 Mock 路径当成生产能力。
- 当前最优先的风险不是“缺少统一网关”本身，而是已有边界在生产配置缺失、Token 类型、支付回调和对象存储所有权上直接失效。
- P0 阻断项有五类：微信登录自动降级为 Mock、Access/Refresh Token 混用、跨服务撤权漂移、微信支付真实模式未验签、客户端可借资产删除任意 OSS Key。
- 正确基础并非为零：常规作品/订单/积分流水查询大多按当前 `userId` 约束；内部 API Guard 在密钥缺失时 fail closed，并使用常量时间比较。这些模式应保留并集中化。

## 2. Files Found

- `apps/auth-service/src/auth/wechat.service.ts`：微信 `code2session` 的真实/Mock 模式选择；缺凭证会自动启用 Mock。
- `apps/auth-service/src/auth/auth.service.ts`、`jwt.service.ts`、`jwt.strategy.ts`：Token 签发、刷新、登出、黑名单和改密失效逻辑。
- `apps/*-service/src/**/jwt.strategy.ts`：10 份服务级 JWT Strategy；只有 auth/user（以及 WebSocket 自身逻辑）执行撤权检查。
- `apps/user-service/src/auth/jwt.strategy.ts`：当前唯一同时查询用户存在性和冻结/注销状态的 HTTP Strategy。
- `libs/common/src/guards/internal-api-key.guard.ts`、`decorators/internal-api.decorator.ts`：共享 `INTERNAL_API_KEY` 的内部调用边界。
- `apps/*/src/**/*billing*.client.ts`、`libs/temporal/src/activities/billing.activities.ts`：多份 HTTP Billing Client 和 Temporal 调用端。
- `apps/order-service/src/order/wechat-pay.service.ts`、`webhook.controller.ts`、`order.service.ts`：微信下单、回调、订单入账和积分发放。
- `libs/common/src/interceptors/response.interceptor.ts`：全局统一响应包装，与微信回调的原始响应契约冲突。
- `apps/asset-service/src/asset/asset.service.ts`、`oss.service.ts`：客户端登记 OSS Key 后由服务端高权限删除。
- `apps/template-service/src/template/template.controller.ts`、`template.service.ts`、`favorite.service.ts`：模板发布、公开读取和收藏边界。
- `apps/workbench-service/src/workbench/generation.service.ts`、`apps/benchmark-service/src/benchmark/benchmark.service.ts`、`apps/order-service/src/order/order.service.ts`：用户自定义幂等键的作用域。
- `apps/media-worker/src/providers/platform-download.provider.ts`、`libs/temporal/src/activities/*.ts`：外部 URL 下载与 provider 返回 URL 的信任边界。
- `apps/miniprogram/src/services/request.ts`、`token.ts`、`hooks/useWebSocket.ts`：生产端点回退、Token 刷新和 WebSocket 鉴权。
- `apps/admin-web/**`、`apps/admin-service/**`：管理端 UI/API；未进入生产 Compose/Nginx。
- `scripts/extract-openapi.ts`、`scripts/gen-types-local.ts`、`scripts/fixtures/*.openapi.json`、`.github/workflows/ci.yml`：运行时代码到 fixture 再到生成类型的契约链。
- `docker/nginx/nginx.conf`、`docker/docker-compose.prod.yml`：公网路由、服务拓扑和生产环境变量注入。

## 3. Dependencies

```text
miniprogram
  -> HTTPS Nginx / WebSocket Nginx
  -> auth, user, asset, benchmark, template, billing, workbench,
     notification, order

admin-web
  -> admin-service
  -> user/order/billing/template/notification service internal HTTP APIs
  -> 当前 production Compose/Nginx 中断链

wechat login code
  -> WechatService code2session
  -> AuthService user upsert/login
  -> JwtTokenService access + refresh
  -> 每个服务各自 JwtStrategy

Bearer token
  -> 签名/issuer/audience/exp
  -> 仅部分服务检查 jti blacklist / password-changed / live user status
  -> controller RBAC / CurrentUser

wechat payment callback
  -> public WebhookController
  -> WechatPayService verify + decrypt
  -> OrderService PAID/UserPackage
  -> order BillingClient GRANT
  -> global ResponseInterceptor

asset lifecycle
  -> client obtains upload credential
  -> client submits arbitrary ossKey in CreateAssetDto
  -> Asset row
  -> delete Asset invokes privileged OSS delete(asset.ossKey)

internal calls
  -> shared x-api-key / INTERNAL_API_KEY
  -> InternalApiKeyGuard
  -> routes still reachable through public Nginx prefixes

OpenAPI
  -> live controllers/decorators
  -> scripts/extract-openapi.ts (service allowlist)
  -> scripts/fixtures/*.openapi.json
  -> gen-types-local.ts
  -> generated frontend types
  -> CI currently checks fixture-to-generated consistency only
```

## 4. Live Architecture And Trust Boundaries

### 4.1 用户认证

`JwtTokenService` 正确地在签发时写入 `type: 'access'` 和 `type: 'refresh'`，且 Refresh Token 使用独立有效期（`apps/auth-service/src/auth/jwt.service.ts:54-89`）。问题出在消费端：所有 HTTP Strategy 只校验签名、issuer、audience 和过期，没有要求 Bearer Token 的 `payload.type === 'access'`；刷新接口直接 `verify` 任意 Token，也没有要求 `type === 'refresh'`（`apps/auth-service/src/auth/auth.service.ts:229-251`）。因此签发端的类型字段当前不构成安全边界。

auth-service 的 Strategy 会查 jti 黑名单和改密标记（`apps/auth-service/src/auth/jwt.strategy.ts:67-82`）；user-service 还会查实时用户与冻结/注销状态（`apps/user-service/src/auth/jwt.strategy.ts:57-110`）。admin-service 等其余 Strategy 仅把已签名 payload 映射为 `request.user`（例：`apps/admin-service/src/auth/jwt.strategy.ts:27-45`）。相同 Token 在不同服务上因撤权规则不同而得到不同授权结果。

### 4.2 服务间认证

`InternalApiKeyGuard` 的实现有两个正确点：未配置预期密钥时返回 500 并拒绝调用，比较时使用 `timingSafeEqual`（`libs/common/src/guards/internal-api-key.guard.ts:20-26,55-72`）。但是单一共享 Key 没有调用方身份、目标 audience、操作 scope、请求时效或重放保护；任一调用服务泄露 Key 即获得所有标记为 `@InternalApi()` 的能力。Nginx 又把 `/api/v1/points/`、`/templates/`、`/notifications/`、`/orders/` 等完整前缀公开代理（`docker/nginx/nginx.conf:211-270`），并未建立私网专用入口。

### 4.3 外部回调和外部资源

微信支付回调是公开入口（`apps/order-service/src/order/webhook.controller.ts:26-44`），但控制器只把解析后的 body 和签名头交给服务，没有保留微信验签所需的 raw body（`:41-57`）。真实模式的 `verifyCallback` 明确仍是 TODO 并返回 `true`（`apps/order-service/src/order/wechat-pay.service.ts:174-185`）；真实下单也缺少微信要求的 `Authorization` 商户签名头（`:253-267`）。

平台视频 URL 和模型返回 URL 最终会进入 `lux`/`yt-dlp` 或下载逻辑。当前边界缺少统一的 DNS 解析后私网/保留地址阻断、重定向逐跳复验、协议/端口 allowlist、最大响应体、落盘配额和端到端总时限。这不仅是 SSRF，也是 worker 磁盘、进程和并发槽位的资源耗尽入口。

## 5. Patterns

以下已有模式应保留并抽到共享边界，而不是在重构时删除：

- **租户查询绑定当前用户**：资产详情使用 `{ id, userId, status: ACTIVE }`（`apps/asset-service/src/asset/asset.service.ts:168-175`）；订单列表按 `o.userId` 过滤，详情再校验 owner（`apps/order-service/src/order/order.service.ts:204-233`）；积分流水列表和详情均带 `userId`（`apps/billing-service/src/billing/billing.service.ts:158-200`）。
- **Controller 从认证上下文取 userId**：订单、作品和积分详情均由 `@CurrentUser('userId')` 传入 service，而非信任 body/query 中的 userId（`apps/order-service/src/order/order.controller.ts:49-59`、`apps/workbench-service/src/workbench/work.controller.ts:40-51`、`apps/billing-service/src/billing/billing.controller.ts:54-55`）。
- **内部密钥 fail closed 和常量时间比较**：`INTERNAL_API_KEY` 缺失或不匹配时拒绝（`libs/common/src/guards/internal-api-key.guard.ts:55-72`）。
- **JWT 明确 issuer/audience/expiration**：各 Strategy 至少配置了签名、issuer、audience 和过期校验（例：`apps/auth-service/src/auth/jwt.strategy.ts:52-60`）。
- **V2 计费参数绑定**：main 库 reservation 会把 user/work/amount 与终态操作绑定，应作为所有内部状态变更 API 的幂等模型，而不是仅靠 Redis Key。该模式见 `apps/billing-service/src/billing/credit-reservation.service.ts:171-247`。

## 6. Risks

### P0-1：微信登录在生产凭证缺失时自动变成认证绕过

`WechatService` 将显式 Mock 标记 **或** AppID/Secret 任一缺失都解释为 Mock（`apps/auth-service/src/auth/wechat.service.ts:53-64`）。Mock 路径对任意非空 code 计算稳定的 `mock_openid_*`，不向微信验证（`:77-101`）。配置遗漏因此不会阻止生产启动，而会允许攻击者自选 code 建立稳定身份。

**修复**：生产/预发布环境必须 fail closed；仅测试进程在显式 allowlist 环境下允许 Mock。启动时记录非敏感模式指标，并为 `NODE_ENV=production + missing credentials` 添加启动失败测试。

### P0-2：Refresh Token 可作为 7 天 Bearer，Access Token 可刷新

- 签发端区分两种 Token（`apps/auth-service/src/auth/jwt.service.ts:54-89`），消费端却不检查 `type`。
- 10 份 HTTP Strategy 没有 `payload.type === 'access'` 的约束；admin 的典型实现只复制 payload（`apps/admin-service/src/auth/jwt.strategy.ts:27-45`）。
- 刷新接口只做通用 `verify` 和 jti 黑名单检查（`apps/auth-service/src/auth/auth.service.ts:229-247`），所以 Access Token 也可刷新。
- 刷新沿用旧 Token 中的 role，不查用户是否冻结/删除，也不查当前角色（`:249-251`）。降权后的旧 Refresh Token 会重新铸造旧权限。
- logout 只吊销当前 Access Token jti（`:262-279`），配对 Refresh Token 仍能刷新。

**修复**：共享唯一 JwtAuthModule；API Strategy 强制 access；refresh endpoint 强制 refresh，并采用可轮换 session/family 记录。刷新时从权威用户表读取状态与角色；logout/reuse detection 吊销整族 Refresh Token。Token payload 使用 `tokenVersion`/session id，而非把角色当作长期权威状态。

### P0-3：封禁、降权、登出和改密的跨服务撤权不一致

auth Strategy 查 blacklist 和 password-changed（`apps/auth-service/src/auth/jwt.strategy.ts:67-82`），user Strategy 再查询用户状态（`apps/user-service/src/auth/jwt.strategy.ts:67-110`），admin Strategy 则均不检查（`apps/admin-service/src/auth/jwt.strategy.ts:38-45`）。因此被登出、冻结或降权的 Token 仍可在多数业务服务执行操作。

改密逻辑只检查 Redis Key 是否存在，不比较 Token `iat`（`apps/auth-service/src/auth/jwt.strategy.ts:76-81`、`apps/user-service/src/auth/jwt.strategy.ts:80-84`）。只要标记 TTL 尚在，改密后新签发的 Token 也会被拒绝，当前语义是“用户未来一段时间全部下线”而非“旧 Token 下线”。

**修复**：所有服务使用同一 Strategy/guard；以用户 `credentialsChangedAt` 或 `tokenVersion` 与 `iat`/claim 比较；管理员敏感操作可额外实时取授权版本。Redis 只能作为缓存/快速撤权通道，权威版本必须可持久恢复。

### P0-4：微信支付真实模式不具备可上线的真实性与完整性校验

- 真实回调验签 TODO 后直接返回 true（`apps/order-service/src/order/wechat-pay.service.ts:174-185`）。
- 真实下单请求缺 `Authorization` 商户签名（`:253-267`）。
- 控制器没有 raw body，只传解析后的对象（`apps/order-service/src/order/webhook.controller.ts:41-57`）。
- 回调链未建立金额、币种、mchid、appid、out_trade_no 与本地订单不可变量的完整匹配。
- Webhook 返回微信要求的 `{code,message}`（`:58-65`），但全局 `ResponseInterceptor` 会把普通返回值包装成 `{code: 0, message, data, traceId}`（`libs/common/src/interceptors/response.interceptor.ts:67-80`），微信可能无法确认成功并持续重试。
- 现有支付测试集中于 Mock，并明确接受 Mock 验签成功，不能证明真实模式。

**修复**：采用微信官方 APIv3 验签/证书轮换库；在 body parser 前捕获 raw bytes；逐项绑定商户、应用、金额、币种和订单状态；回调路由跳过平台 envelope，返回供应商原始契约。用微信签名 fixture 覆盖正确签名、篡改 body、过期 timestamp、未知 serial、错误金额和重复回调。

### P0-5：任意 OSS 对象删除

资产创建直接持久化客户端提供的 `dto.ossKey`、size、mimeType 和 thumbnailKey（`apps/asset-service/src/asset/asset.service.ts:135-154`）。删除时虽然先按资产 row 校验 userId，但随后使用服务端高权限凭证删除 row 中的 Key（`:188-205`）。攻击者可先登记其他用户或系统对象 Key，再删除自己的资产 row，间接删除该对象。当前没有校验用户命名空间前缀、上传凭证绑定、OSS HEAD 元数据或服务端签发的 upload intent。

**修复**：创建 upload intent（userId、允许前缀、content type、size、nonce、expiry），上传完成只能用 intent id finalize；服务端 HEAD 对象并核对 key/etag/size/metadata。删除只接受服务端已验证、按用户命名空间生成的 Key，数据库 row 与对象删除使用 durable cleanup job。对既有不可信 Key 先审计分类，不能直接批量删除。

### P1-1：模板发布、公开详情和收藏存在授权/状态旁路

`POST /templates/publish` 直接接受 `sourceWorkId`、`coverKey`、`videoKey`（`apps/template-service/src/template/template.controller.ts:94-102`），service 直接落库为待审状态（`apps/template-service/src/template/template.service.ts:168-195`），绕过 workbench `publishAsTemplate` 对作品归属和完成状态的校验。公开详情仅按 id 读取（`:149-154`），因此 PENDING/REJECTED/ANALYZING 模板可能被公开读取；收藏也没有强制模板 ACTIVE。

**修复**：只保留一个领域命令 `publishOwnedCompletedWork`；外部 DTO 不接受对象 Key 和 owner id。公共 repository/query 强制 ACTIVE，审核端使用独立内部查询。收藏写入同样要求 ACTIVE，并用集成测试覆盖跨用户 sourceWorkId 和非 ACTIVE id。

### P1-2：用户幂等键没有租户命名空间

workbench、benchmark、order 均允许客户端传幂等键，但缓存/锁或查询键未统一绑定 userId（`apps/workbench-service/src/workbench/generation.service.ts:53-56,150-184,855-870`、`apps/benchmark-service/src/benchmark/benchmark.service.ts:76-78,132-142`、`apps/order-service/src/order/order.service.ts:71-72,114-124`）。两个用户选择同一 Key 时可能读到他人资源 id/结果、错误复用操作或互相阻断。

**修复**：所有外部幂等键规范化为 `tenant:user:operation:key`，数据库唯一约束至少覆盖 `(user_id, operation, idempotency_key)`；命中后校验规范化请求 hash，参数不同返回 409。Redis 只能加速，DB operation record 才是权威。

### P1-3：内部 API 既是共享万能密钥，又存在调用方/服务端契约断裂

多份 BillingClient 和 admin 调用端各自拼 URL/header，已经发生漂移。admin 当前调用仓库中不存在的目标包括：

- `POST /api/v1/points/deduct`（`apps/admin-service/src/admin-order/admin-order.service.ts:280-294`）；
- `POST /api/v1/orders/:id/refund`（`:324-333`）；
- `POST /api/v1/billing/reconcile`（`apps/admin-service/src/admin-reconcile/admin-reconcile.service.ts:100-118`）；
- notification 的 POST/send/system 组合（`apps/admin-service/src/admin-notification/admin-notification.service.ts:85-193`）。

单一 `INTERNAL_API_KEY` 被 workbench、benchmark、order、template、admin 和 Temporal activities 共用（例如 `apps/workbench-service/src/workbench/billing.client.ts:62`、`libs/temporal/src/activities/billing.activities.ts:31-33`）。它不能表达“谁可调用什么”，轮换也要求全系统同步切换。

**修复**：先以 consumer-driven contract test 阻止不存在端点；再建立私网 service identity（mTLS/SPIFFE 或短期 service JWT，包含 issuer/audience/scope/jti/exp），每个内部 command 记录 actor、request id 和幂等 operation id。Nginx 公网入口显式拒绝内部路径。

### P1-4：外部 URL 下载缺少统一 SSRF 与资源预算策略

benchmark 平台 URL 会交给本地下载器，Seedance 等 provider 返回 URL 也进入下载链。仅靠“URL 看起来是 http(s)”无法防 DNS rebinding、重定向到私网、超大/无限流、压缩炸弹和慢速响应。子进程下载器还绕开 axios 级拦截器。

**修复**：建立唯一 `SafeMediaFetcher`：解析并固定公共 IP、逐跳验证 redirect、禁止保留/私网/metadata IP、限制协议与端口；HEAD 只能作提示，流式下载必须硬限制 bytes、duration、rate、并发和落盘目录；子进程加入 kill deadline、输出文件配额和 sandbox。provider 回传 URL 与用户 URL 使用同一策略，并增加 DNS rebinding/redirect/IPv6/超限测试。

### P1-5：管理端生产链路不存在

Nginx upstream 只有 9 个业务服务，没有 admin-service（`docker/nginx/nginx.conf:77-85`）；生产 Compose 也没有 admin-service/admin-web，nginx 的依赖清单止于 order-service（`docker/docker-compose.prod.yml:168-177,411-420,479-509`）。因此 admin 源码和测试存在不等于生产可访问，也没有证据证明后台认证、RBAC 和内部调用能形成闭环。

**修复**：在修完 admin 内部契约前不要简单暴露。生产拓扑应为独立管理域名、强 MFA/SSO、IP/WAF 策略、短 session、CSRF/Origin 保护、细粒度审计和独立 upstream；部署 smoke 必须实际登录并执行只读操作。

### P1-6：OpenAPI 门禁验证的是 fixture 自洽，不是源码契约

CI 仅运行 fixture 到 generated types 后检查 diff（`.github/workflows/ci.yml:64-68`）。离线提取脚本的服务 allowlist 从 user-service 开始且没有 auth-service（`scripts/extract-openapi.ts:53-144`），但目录中已有 auth fixture，说明 fixture 可以脱离提取器长期存在。10 个 fixture 中没有操作级 `security` 或 `x-internal` 标记；admin-web 虽有生成文件，但生产源码没有引用，miniprogram 主要只有 auth 流程使用生成类型。

**修复**：CI 从当前源码启动最小 Nest application 重新生成全部 schema，先检查服务清单完整，再生成 client；受保护路由必须有 bearer security，内部路由必须有 machine-auth security/extension。前端 API wrapper 直接消费生成 operation 类型，禁止平行手写 DTO。

### P1-7：小程序生产配置可静默回退本机，WebSocket 把 Token 放在 URL

HTTP request/token 模块在缺少构建变量时回退 `http://localhost:3000/api`（`apps/miniprogram/src/services/request.ts:200`、`apps/miniprogram/src/services/token.ts:113`）。WebSocket 更是硬编码 `ws://localhost:3008`，连接时使用 `?token=`（`apps/miniprogram/src/hooks/useWebSocket.ts:28-29,75`）。生产构建可成功但完全不可用；query Token 还会进入代理/access log、诊断和监控 URL。

**修复**：生产构建缺 API/WS origin 时直接失败；仅允许 `https/wss` 和 allowlisted host。小程序 WebSocket 若平台 API 无法自定义 Authorization header，使用一次性、短期、单 audience 的 websocket ticket，服务端消费即失效；任何日志都必须删除 query/credential。

### P2-1：重复 bootstrap、JWT Strategy 和内部 Client 已产生可见行为漂移

仓库有 10 份 JWT Strategy、约 4 份 BillingClient 和 10 份 CORS/bootstrap。部分服务限制 origin，部分直接 `enableCors()`（`apps/template-service/src/main.ts:25-26`、`apps/user-service/src/main.ts:42-43`、`apps/asset-service/src/main.ts:25-26`）。auth/user 有撤权检查，其余只验签。这不是单纯重复代码问题，而是安全策略无法原子发布。

**修复**：共享模块只负责协议级、可配置边界；业务授权仍留在领域服务。统一 `bootstrapHttpService`、`JwtAuthModule`、machine-auth client/interceptor 和 provider callback bypass envelope 元数据，并用一组契约测试覆盖所有服务。

### P2-2：安全测试矩阵存在系统性空白

- Auth 测试未覆盖 Access/Refresh 类型互斥、角色/状态刷新、Refresh rotation/reuse 和整族吊销。
- WechatService、多数 JWT Strategy、InternalApiKeyGuard 缺独立攻击面测试。
- 支付测试主要是 Mock，没有有效 APIv3 签名、raw-body 篡改和金额/商户不变量。
- Asset 测试接受任意 `ossKey`，没有 HEAD/owner/upload-intent 校验。
- SSRF 测试只经过 Mock，不执行真实下载边界。
- 集成环境强制微信、支付和 Temporal 为 Mock（`tests/integration/setup.ts:22-28,48-67`）。

这些测试可证明业务 happy path，不足以证明真实边界安全。

## 7. Executable Refactor Plan

### Phase 0：立即阻断可利用路径

1. 生产缺微信凭证时启动失败；为 Mock 增加显式 test-only allowlist。
2. 所有 Strategy 强制 access Token；refresh 强制 refresh Token。
3. 暂停真实微信支付入口或让真实模式 fail closed，直到验签/raw body/回调不变量全部实现。
4. 暂停接受任意 OSS Key 的资产 finalize/delete；只允许服务端签发前缀内对象。
5. 在 Nginx 暂时拒绝已知内部端点的公网访问。

### Phase 1：集中身份与撤权

1. 创建共享 JwtAuthModule，删除服务私有 Strategy。
2. 引入持久化 session/token family 和 rotation/reuse detection。
3. 使用 `tokenVersion`/`credentialsChangedAt` 实现全服务一致撤权。
4. 刷新时读取当前用户状态/角色；管理员敏感动作实施 step-up auth。
5. 添加跨服务 auth contract suite，同一 Token 在所有服务必须得到相同认证结论。

### Phase 2：关闭资金和对象存储边界

1. 完成微信 APIv3 请求签名、平台证书轮换、raw-body 验签和业务不变量。
2. 让 webhook 返回供应商原始 envelope，并建立重复回调的数据库幂等约束。
3. 建立 OSS upload intent/finalize/cleanup 状态机；存储经过 HEAD 核验的元数据。
4. 扫描既有资产 Key，按可信前缀和元数据分级，人工处理异常引用。

### Phase 3：统一内部契约和服务身份

1. 先删除或实现 admin 当前调用的不存在端点，由 consumer contract 测试锁定。
2. 将 BillingClient/NotificationClient 等收敛为版本化 SDK 或消息 command。
3. 用有 audience/scope/expiry 的服务身份替代共享万能 Key，并支持双 Key/双证书滚动轮换。
4. 将内部入口隔离到私网 listener，公网 Nginx 明确 deny。

### Phase 4：统一外部输入安全

1. 交付 `SafeMediaFetcher` 和子进程 sandbox/预算。
2. URL 下载、文件上传、Webhook 分别建立大小、时间、并发、类型和审计策略。
3. 模板发布只接受业务资源 id，不接受 owner/key 等服务端可推导字段。
4. 所有外部幂等 operation 使用 tenant namespace + DB request hash。

### Phase 5：修复契约和生产链路

1. OpenAPI 从 live source 生成，服务清单完整性和 security metadata 成为 CI gate。
2. miniprogram/admin-web 直接消费生成 operation 类型；生产配置缺失时 build fail。
3. 在内部契约修复后再部署 admin-service/admin-web，采用独立管理域和安全策略。
4. 合并 bootstrap/CORS/response envelope，并给第三方 callback 提供显式 raw-response route。

## 8. Acceptance Criteria

- `NODE_ENV=production` 且缺微信 AppID/Secret 时 auth-service 无法启动；任意 code 不能产生用户。
- Refresh Token 访问任一 Bearer API 均为 401；Access Token 调 refresh 为 401。
- 用户 logout、改密、冻结、删除、降权后，对全部 HTTP/WS 服务的旧 Token 验证结果一致；改密后新 Token 可立即使用。
- Refresh Token 单次轮换；旧 Token 重放会吊销 token family；logout 后 Access/Refresh 均不可复用。
- 支付回调对篡改 raw body、错误签名、过期 timestamp、错误 serial/appid/mchid/amount/currency/order 均拒绝；合法重复回调只入账一次。
- 微信回调成功响应字节级符合供应商 schema，不被平台 ResponseInterceptor 包装。
- 用户无法 finalize 或删除其 upload intent 前缀外对象；OSS HEAD 元数据不匹配时拒绝；删除失败可重试且不丢审计记录。
- 模板发布不能引用他人/未完成作品；公共详情和收藏对非 ACTIVE 模板统一 404/拒绝。
- 相同外部幂等键可由不同用户独立使用；同用户同键不同 payload 返回 409；并发只创建一个 operation。
- 公网无法到达内部 command；服务 A 的凭证不能调用未授权 scope/audience；轮换期间无全量停机。
- SSRF 测试覆盖 loopback、RFC1918、link-local、IPv6、DNS rebinding、重定向、超大、慢流和下载器子进程超时，全部 fail closed。
- CI 从实时源码提取所有服务 OpenAPI；受保护和内部 operation 都有正确 security metadata；fixture 漂移会失败。
- miniprogram 生产构建不存在 localhost/ws，缺端点配置时构建失败；日志中不出现 JWT/query ticket。
- admin 生产 smoke 证明部署可达、管理员认证/RBAC 生效、至少一个只读跨服务调用成功；在此之前不宣称后台已交付。

## 9. Live Code / Fixture / Document / Mock Matrix

| 能力               | Live code                              | Fixture/生成物                     | Mock/测试                         | 结论                   |
| ------------------ | -------------------------------------- | ---------------------------------- | --------------------------------- | ---------------------- |
| 微信登录           | 有真实 code2session，但缺凭证自动 Mock | auth fixture 存在但提取器遗漏 auth | 任意 code 生成稳定 openid         | 生产认证边界 P0        |
| JWT access/refresh | 签发有 type，消费不校验                | OpenAPI 无法表达 Token 类型互斥    | 未覆盖混用/rotation               | 生命周期 P0            |
| 跨服务撤权         | auth/user 部分实现，其余漂移           | 无统一 auth contract               | 无全服务矩阵                      | 封禁/降权可绕过        |
| 微信支付           | 请求签名/真实验签未完成                | 有 order fixture                   | 测试强制 Mock                     | 不具备真实上线证据     |
| OSS 资产           | 任意 key 落库并可被高权限删除          | asset fixture 不描述 upload intent | 测试接受任意 key                  | 对象所有权 P0          |
| 内部 API           | shared Key Guard 存在                  | 无 operation security/x-internal   | 单 client mock 为主               | 身份过宽且契约断裂     |
| SSRF 防护          | 下载器/worker 有功能，无统一策略       | 不适用                             | Mock 路径不触发真实下载           | 无真实安全证据         |
| Admin              | 源码存在                               | 生成 types 存在但未使用            | 单元测试存在                      | Compose/Nginx 未部署   |
| OpenAPI            | controller/decorator 是潜在真源        | CI 只校验 fixture -> types         | extractor 以 mock provider 建 app | 不能证明 live contract |
| Miniprogram        | auth 类型有实际引用                    | 其他生成类型大多未消费             | WS 测试固化 localhost             | 生产配置未闭环         |

## 10. Residual Risks And Coordination

- 身份、支付、计费和订单改造存在顺序依赖：先修 Token/服务身份，再开放 admin；先建立支付回调幂等与业务不变量，再迁移积分发放。
- OSS Key 修复不能直接清理历史对象；历史 row 本身来自不可信客户端输入，需要先做只读清单、前缀/metadata 核验和备份。
- SSRF 不能只在 axios helper 中修复，因为 `lux`/`yt-dlp` 子进程会绕开它；策略必须覆盖 DNS、网络命名空间和资源配额。
- 将角色完全放入短期 JWT 可接受，但不能继续让 7 天 Refresh Token 内角色成为刷新权威。
- OpenAPI security metadata 只描述契约，不替代运行时 Guard；两者必须由 contract test 对齐。
- 本报告未运行真实微信、真实支付、真实 OSS、生产 DNS/TLS 或完整部署验证；结论来自当前源码和测试边界，不能表述为生产验收。
