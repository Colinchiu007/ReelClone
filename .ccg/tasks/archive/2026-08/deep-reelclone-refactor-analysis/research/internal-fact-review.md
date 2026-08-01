# 项目深度重构报告内部事实审查

> 审查基线：`master@2ffed0e0b70021aef1c9a514033c938854554f2b`
>
> 审查对象：`01-docs/13-项目深度重构分析报告.md` 当前 584 行版本及 `research/*`。
>
> 结论：报告的大部分 P0/P1 主张与当前代码一致，但仍有 1 个 Critical、3 个 Warning 和 1 个 Info 需要在定稿前处理。以下均为只读审查结论，未修改报告或源代码。

## Critical

### C-1 支付 P0 的验收条件缺少“回调业务不变量绑定”

- 报告已经正确覆盖请求签名、raw body、平台证书、时间窗、nonce/replay 和 AES-GCM（报告 `:191-210`），但 Phase 0 验收和安全门禁只要求签名向量、过期/重放/错证书（报告 `:486`、`:541`）。它没有要求把解密结果中的 `appid/mchid/out_trade_no/amount/currency` 与本地配置和订单逐项绑定。
- 当前 `WechatPayResult` 虽已有 `amount.total/payer_total/currency`（`apps/order-service/src/order/wechat-pay.service.ts:63-82`），却没有建模 `appid/mchid`。`OrderService.handleCallback` 只做 verify、decrypt、按 `out_trade_no` 查订单，随后直接置 PAID 并创建 UserPackage（`apps/order-service/src/order/order.service.ts:289-307`、`:321-392`），没有比较回调金额与 `Order.amount`（`libs/database/src/entities/order.entity.ts:45-52`）。
- 因而即使未来实现的签名测试全部通过，错误商户/应用或金额不匹配的合法签名消息仍可能驱动本地入账。支付属于资金边界，这个缺口会使报告自己的 Phase 0 门禁产生 false positive。
- 建议报告在 P0-2、Phase 0 验收和安全门禁中明确增加：`appid`、`mchid`、`out_trade_no`、`transaction_id` 唯一性、`amount.total`、`currency` 全量匹配；错误金额/商户/应用必须拒绝且不改变订单、套餐和积分。

## Warning

### W-1 “实时架构”混合了代码清单、逻辑数据归属和实际部署拓扑

- 图中声明 `React Admin Web -> Nginx`（报告 `:97-108`），但生产 Nginx 只定义 9 个业务 upstream，没有 admin-service/admin-web（`docker/nginx/nginx.conf:74-85`）；生产 Compose 的 Nginx 依赖也只列这 9 个服务（`docker/docker-compose.prod.yml:475-509`）。因此 admin 当前是仓库代码资产，不是该生产拓扑中的可达运行节点。
- 图中只画了按领域划分的数据库边（报告 `:117-121`），但 `DatabaseModule.forRoot()` 实际无条件初始化四个连接（`libs/database/src/modules/database.module.ts:105-128`），auth/order/benchmark/template/media-worker 等都调用它（`apps/auth-service/src/app.module.ts:49`、`apps/order-service/src/app.module.ts:43`、`apps/benchmark-service/src/app.module.ts:43`、`apps/template-service/src/app.module.ts:51`、`apps/media-worker/src/app.module.ts:55`）。报告自己在 P1-6 又承认这一点（报告 `:351-355`），与图的“实时”含义冲突。
- Redis 边也漏了 benchmark/order/template/media-worker；这些应用都注册 `RedisModule.forRoot()`（`apps/benchmark-service/src/app.module.ts:45`、`apps/order-service/src/app.module.ts:45`、`apps/template-service/src/app.module.ts:53`、`apps/media-worker/src/app.module.ts:56`）。
- 建议拆成“当前生产部署拓扑”和“逻辑数据所有权”两张图；前者标明 admin 未部署、所有后端进程对四库的实际启动依赖，后者再画领域归属。

### W-2 P0-5 漏报可直接阻断 clean deployment 的数据库/Temporal 契约

- 报告 P0-5 已覆盖 build、Docker matrix、前端跳过、E2E 和 health（报告 `:254-280`），但没有记录研究材料中已经确认的 fresh-deploy 阻断。
- 生产 env 要求替换 `TEMPORAL_DB_PASSWORD`（`docker/.env.production.example:33-35`），init SQL 却始终把 temporal 用户密码重置为字面量 `temporal`（`docker/init-db.sql:35-42`），Compose 再用 env 中的新密码连接（`docker/docker-compose.prod.yml:118-129`）。按示例部署会认证失败。
- 应用/worker 默认使用 namespace `reelclone`（`docker/.env.production.example:88-93`；`apps/media-worker/src/worker/worker.bootstrap.ts:64-66`），但 Compose/init/deploy 没有 namespace 创建步骤；worker 还只等待 Temporal `service_started`（`docker/docker-compose.prod.yml:445-466`）。
- 部署脚本允许迁移失败后交互式继续，缺 npx 时直接跳过迁移（`scripts/deploy.sh:225-240`），与报告“失败不可交互式越过”的目标门禁（报告 `:550`）相反。
- 报告正文把 fresh migration、clean-volume smoke 和最小 Temporal workflow 放在 P0（报告 `:269-278`），路线图又把相近门禁放到 Phase 3（报告 `:511-517`）。应明确 Phase 0 的最小 bootstrap contract 与 Phase 3 的 N-1/灾备强化边界，并把上述当前阻断列入 P0 证据。

### W-3 模板奖励补偿的确定性漏发未进入计费事实清单和 Phase 0

- 报告 P0-3 提到 legacy REWARD 双写并要求迁移 template（报告 `:212-229`），但“已确认的业务缺陷”和 Phase 0 表没有记录当前模板补发算法会永久漏掉特定奖励序号（报告 `:220-225`、`:481-492`）。
- 实时路径用 `reward:template:{id}:use:{useCount}` 作为稳定键（`apps/template-service/src/template/template.service.ts:256-292`）。补偿器却只读取已发放条数 `rewardCount`，再补 `(rewardCount, useCount]`（`apps/template-service/src/template/reward-reconciliation.service.ts:89-129`）。
- 反例：use 1 和 3 已发、use 2 失败时，`rewardCount=2`；补偿器只重放 use 3，幂等返回后 use 2 仍永久缺失。扫描还固定取 useCount 最大的前 500 条（同文件 `:75-82`），低热度模板可能长期饥饿。
- 建议至少把该缺陷列为 P1 数据正确性事实，并在迁移前增加止损验收：按 durable operation/ordinal 枚举缺口，不能用 count 推导缺失序号；扫描必须有稳定游标和全量可达性。

## Info

### I-1 “106 个测试文件”口径无法从报告复现

- 报告给出 106 个测试文件、约 21,888 行（报告 `:47-52`），但没有记录 glob、是否包含 helper/config/setup、以及统计的是物理行还是去空白/注释后的代码行。
- 在当前基线上，标准测试文件 glob `*.spec.ts|*.spec.tsx|*.test.ts|*.test.tsx` 得到 100 个文件；72 个后端 suite、18 个 miniprogram suite、10 个 integration spec 也正好是 100。若 106 包含 6 个测试辅助/配置文件，应改称“测试资产”并列出统计命令；否则文件数需要更正。
- 此问题不改变风险排序，但会影响报告作为可复查基线的可信度。45,092/21,888 这类代码行数字也应注明统计工具和过滤条件。

## 已抽查且证据成立

- 基线 SHA、分支、853 个 Git 跟踪文件、13 个应用目录、7 个共享库均与当前仓库一致。
- `GenerationService` 872 行、video workflow 536 行与物理行数一致（报告 `:131-132`）。
- V2 main-authoritative reservation/outbox、行锁单终态、FREEZE-before-terminal、`SKIP LOCKED`、确定性 workflow ID 和 Provider 未确认前不退款均有对应实现（报告 `:158-164`）。
- legacy 双写、benchmark 同 key 补偿、admin 非法 UUID、paid-without-grant、错误 reconciliation 公式、mock COMPLETED+OPEN、Provider idempotentKey 未进入 HTTP 请求、settle 后回写失败转 release、outbox 索引/饥饿问题均与当前源码一致。
- CI 的 echo build、错误 Docker matrix、跳过小程序 build、坏 integration 入口、错误 health 路径、旧 coverage 快照数字均可复现。
- 最新报告已正确补入微信登录自动 Mock、Access/Refresh 混用、跨服务撤权漂移、raw body/response envelope、任意 OSS Key 删除、模板发布状态旁路、跨租户幂等键和共享 internal key 等安全事实。

## 验证

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:unit -- --runInBand`：通过，后台任务退出码 0；仍出现报告已记录的 `MaxListenersExceededWarning`。
- `npm run test:miniprogram -- --runInBand`：18 suites / 302 tests 通过；仍出现报告已记录的 `act(...)` 警告。
- `npm run test:integration -- --runInBand`：失败，`jest.integration.config.js` 不存在；与报告一致。
- `git diff --check`：通过（写入本审查前）。
