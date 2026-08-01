# 计费、数据库与一致性分析

## 1. 范围与基线

- 分析基线：`master` / `2ffed0e`（2026-08-01 当前工作区）。
- 本仓库没有 Prisma schema，也没有 Prisma 依赖；数据访问层实际是 NestJS + TypeORM。根依赖声明 `@nestjs/typeorm`（`package.json:72`），连接与实体注册集中在 `libs/database/src/modules/database.module.ts:1-24`、`libs/database/src/modules/database.module.ts:72-87`。
- 生产 schema 的实际来源是 TypeORM 实体 + 手写 migration，且 `synchronize: false`（`libs/database/src/modules/database.module.ts:72-87`）。不能把本任务中的“Prisma schema”理解为存在的文件。
- 当前 billing 定向单元测试命令通过：
  `npx jest --runInBand apps/billing-service/src/billing/credit-reservation.service.spec.ts apps/billing-service/src/billing/ledger.service.spec.ts apps/billing-service/src/billing/billing.service.spec.ts`，结果为 3 suites / 51 tests 全部通过。它们主要是 Repository/DataSource mock，不等价于真实 PostgreSQL 跨库、并发或故障注入验证。

## 2. 数据边界与权威性

### 2.1 四连接拓扑

| 连接        | 实体                                                              | 当前语义                                                                          | 证据                                                                                                          |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `main`      | `User`、`Work`、`CreditReservation`、`BillingProjectionOutbox` 等 | `User.currentPoints` 是可用余额；V2 reservation 状态和投影意图在这里权威提交      | `libs/database/src/modules/database.module.ts:40-56`                                                          |
| `billing`   | 仅 `PointTransaction`                                             | 查询流水和 main -> billing 的审计投影；遗留路径仍错误地把它当成跨库写事务的一部分 | `libs/database/src/modules/database.module.ts:58-60`                                                          |
| `template`  | `Template`、`Favorite`                                            | 模板使用计数和奖励触发源                                                          | `libs/database/src/modules/database.module.ts:61-63`                                                          |
| `benchmark` | `Benchmark`                                                       | 对标任务状态；当前只把 freezeId 暂存在 Redis                                      | `libs/database/src/modules/database.module.ts:64-65`、`libs/database/src/entities/benchmark.entity.ts:33-103` |

四个“独立数据库”仍共享同一组 host/port/user/password，数据库名硬编码；连接配置没有独立 DSN、SSL/pool/statement timeout（`libs/database/src/modules/database.module.ts:72-87`）。`billing-service` 自身也初始化全部四个连接，而非只初始化 main/billing（`apps/billing-service/src/app.module.ts:35-49`），因此无关数据库故障会扩大启动和连接池影响面。

### 2.2 V2 生成计费调用链

```text
GenerationService
  -> workbench BillingClient (reservationMode=true)
  -> BillingService.freeze/settle/release
  -> CreditReservationService
  -> main transaction:
       User row + CreditReservation + BillingProjectionOutbox
  -> async projector / 15s cron
  -> billing PointTransaction (idempotent projection)
  -> main outbox DELIVERED + terminalTransactionId
```

- workbench 的 freeze 固定发送 `reservationMode: true`，terminal 默认也是 V2（`apps/workbench-service/src/workbench/billing.client.ts:81-100`、`apps/workbench-service/src/workbench/billing.client.ts:111-163`）。
- `CreditReservationService` 明确把 main 库视为唯一权威，billing 仅为至少一次投影（`apps/billing-service/src/billing/credit-reservation.service.ts:42-47`）。
- 余额扣减、OPEN reservation 和 FREEZE outbox 在同一 main 事务（`apps/billing-service/src/billing/credit-reservation.service.ts:58-110`）。
- SETTLED/RELEASED 状态、RELEASE 返还余额和 terminal outbox 也在同一 main 事务（`apps/billing-service/src/billing/credit-reservation.service.ts:171-247`）。

### 2.3 仍然存在的遗留调用链

```text
benchmark FREEZE/RELEASE, order/admin GRANT, template REWARD, latent CONSUME
  -> BillingService.runIdempotent (Redis + billing idempotency lookup)
  -> LedgerService
  -> main transaction mutates User
  -> direct billing PointTransaction insert
```

这些操作没有 authoritative operation/outbox。Redis 锁和 billing 唯一键只能防“billing 流水已经存在”的重放，无法覆盖“main 已提交、billing 尚未写入”的崩溃窗口。

## 3. 已实现的保护（应保留）

| 保护                                    | 实现证据                                                  | 保护边界                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 防止同一用户并发超扣                    | main 事务中 `SELECT ... FOR UPDATE` 锁 User               | `apps/billing-service/src/billing/ledger.service.ts:85-104`                                                                                                       |
| V2 金额、余额和 outbox 原子提交         | freeze/terminal 都在 main transaction 内                  | `apps/billing-service/src/billing/credit-reservation.service.ts:58-110`、`:171-247`                                                                               |
| 同一 Work 最多一个 OPEN reservation     | partial unique index                                      | `libs/database/src/entities/credit-reservation.entity.ts:24-38`、`libs/database/src/migrations/main/0008_add_credit_reservations_and_billing_outbox.ts:51-59`     |
| SETTLE/RELEASE 竞争只能有一个终态       | reservation 悲观写锁 + OPEN 状态检查                      | `apps/billing-service/src/billing/credit-reservation.service.ts:178-215`                                                                                          |
| 禁止部分结算/释放及跨用户/跨 Work 操作  | 校验原 amount、userId、workId                             | `apps/billing-service/src/billing/credit-reservation.service.ts:181-203`                                                                                          |
| FREEZE 必须先于 terminal 投影           | terminal 投影前检查 FREEZE 已 DELIVERED                   | `apps/billing-service/src/billing/credit-reservation.service.ts:291-302`                                                                                          |
| 至少一次投影可收敛                      | billing `idempotency_key` 唯一；写后 ack 失败可查询原流水 | `libs/database/src/entities/point-transaction.entity.ts:66-69`、`apps/billing-service/src/billing/credit-reservation.service.ts:304-329`                          |
| 多 projector 不重复处理同一 outbox      | main outbox 行锁 + `SKIP LOCKED`                          | `apps/billing-service/src/billing/credit-reservation.service.ts:273-289`                                                                                          |
| 防止 V2 流水被 legacy terminal API 操作 | legacy lock 检测 `reservationId` 后 fail closed           | `apps/billing-service/src/billing/ledger.service.ts:194-217`                                                                                                      |
| V2 frozen 查询不依赖异步投影            | legacy 从 billing 聚合，V2 从 main OPEN reservation 聚合  | `apps/billing-service/src/billing/ledger.service.ts:108-139`                                                                                                      |
| 不猜测历史关联                          | migrations 明确不从描述/金额回填                          | `libs/database/src/migrations/main/0008_add_credit_reservations_and_billing_outbox.ts:3-8`、`libs/database/src/migrations/billing/0004_add_reservation_id.ts:3-8` |
| migration 有基本 DB 约束                | amount > 0、main 内 FK、outbox/reservation 唯一索引       | `libs/database/src/migrations/main/0008_add_credit_reservations_and_billing_outbox.ts:23-118`                                                                     |

这些保护说明 V2 方向正确：无需引入跨数据库 2PC；应把所有余额变更统一迁入“main 权威操作 + outbox 投影”模式。

## 4. 残余风险

### P0-1：遗留 LedgerService 仍有不可恢复的跨库双写窗口

`LedgerService` 的文件注释声称“先 main 提交，再 billing 插入”（`apps/billing-service/src/billing/ledger.service.ts:10-14`），但各路径的真实顺序并不统一，也没有 durable operation record：

| 操作                     | 当前顺序                                                                          | 崩溃/失败后果                                                               | 证据                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| legacy FREEZE            | main 事务持 User 锁并更新余额，然后在该 main 事务尚未提交时直写 billing           | billing 成功、main 回滚会留下幽灵 FREEZE；main/billing 之间崩溃无法原子恢复 | `apps/billing-service/src/billing/ledger.service.ts:268-305`                         |
| legacy RELEASE           | billing 事务锁 freeze；嵌套 main 事务先返还并提交；之后才写/提交 billing terminal | billing 写失败时余额已返还但 terminal 不存在；重试会再次返还                | `apps/billing-service/src/billing/ledger.service.ts:375-417`                         |
| GRANT / REWARD / CONSUME | main 先提交余额，然后 billing 单条 insert                                         | billing 失败时 DB 幂等预检查查不到流水，重试会再次改余额                    | `apps/billing-service/src/billing/ledger.service.ts:430-468`、`:483-520`、`:533-576` |

`runIdempotent` 的 DB 双检只查询 billing 流水（`apps/billing-service/src/billing/billing.service.ts:395-453`）。因此 Redis 并不能补上跨库 commit gap。其锁还使用固定值 `1`、固定 30 秒 TTL，finally 直接 `DEL`；旧请求超时后可能删除新持有者的锁（`apps/billing-service/src/billing/billing.service.ts:411-470`）。

另外，幂等命中没有校验 user/operation/amount/reference 是否与原请求一致；全局键碰撞会直接返回另一操作的通用结果（`apps/billing-service/src/billing/billing.service.ts:440-453`）。V2 freeze/terminal 的参数绑定检查比 legacy 更强（`apps/billing-service/src/billing/credit-reservation.service.ts:191-215`、`:348-377`）。

### P0-2：benchmark 计费生命周期当前不闭环

这是当前最明确、可由静态调用链直接证明的业务缺陷：

1. freeze 使用 create 的 `idempotencyKey`（`apps/benchmark-service/src/benchmark/benchmark.service.ts:131-170`）。
2. Temporal 启动失败时，补偿 release 又传入同一个 key（`apps/benchmark-service/src/benchmark/benchmark.service.ts:227-248`）。
3. billing 的 `runIdempotent` 会先命中 FREEZE 的 Redis 结果；即使 Redis 丢失，也会命中 billing 中同 key 的 FREEZE，并在执行 release 前直接返回（`apps/billing-service/src/billing/billing.service.ts:395-453`）。
4. `compensateRelease` 随后会认为调用成功并删除 freezeId（`apps/benchmark-service/src/benchmark/benchmark.service.ts:434-455`）。结果是积分仍冻结，恢复定位信息反而被删除。

此外：

- benchmark BillingClient 只有 freeze/release，没有 settle（`apps/benchmark-service/src/benchmark/billing-client.ts:1-5`、`:83-125`）；成功任务没有把 FREEZE 终态化，冻结余额会永久累积。Mock 成功路径同样只标记 COMPLETED（`apps/benchmark-service/src/benchmark/benchmark.service.ts:182-225`）。
- 真实 benchmark Temporal workflow 的 activity 类型只有 Analyzer + Notification，没有 Billing；成功和运行期失败路径都只更新状态/通知（`libs/temporal/src/workflows/benchmark-analysis.workflow.ts:20-21`、`:54-119`）。它还返回 `consumedCredits: 1`，而入口默认冻结 300（`libs/temporal/src/workflows/benchmark-analysis.workflow.ts:91-98`、`apps/benchmark-service/src/benchmark/benchmark.service.ts:34-39`），金额契约也不一致。
- freezeId 只存 Redis 7 天（`apps/benchmark-service/src/benchmark/benchmark.service.ts:34-39`、`:166-172`），`Benchmark` 表没有 reservation/freeze/idempotency 字段（`libs/database/src/entities/benchmark.entity.ts:37-103`）。Redis 丢失或 TTL 到期后取消/失败无法退款。
- 补偿失败只打日志并吞掉异常，没有 pending 状态或重试记录（`apps/benchmark-service/src/benchmark/benchmark.service.ts:434-461`）。
- create 的幂等只查 Redis 后直接创建 Benchmark，没有拥有者 token/DB 唯一键（`apps/benchmark-service/src/benchmark/benchmark.service.ts:131-170`）。并发相同 key 可创建多个任务，并共享同一 legacy FREEZE。

### P0-3：管理员调账会在 main 已加分后因伪 UUID 写流水失败

- `PointTransaction.orderId` 是 PostgreSQL `uuid`（`libs/database/src/entities/point-transaction.entity.ts:50-52`）。
- billing DTO 只要求字符串，没有 UUID 校验（`apps/billing-service/src/billing/dto/grant-points.dto.ts:37-51`）。
- admin-service 固定发送 `orderId: 'admin-grant'`（`apps/admin-service/src/admin-user/admin-user.service.ts:267-278`）。
- `LedgerService.grant` 先提交 main 余额，再把该非法 UUID 写入 billing（`apps/billing-service/src/billing/ledger.service.ts:440-459`）。

因此请求会在余额已经增加后因 billing UUID 转换失败而报错。billing 没有留下幂等流水，重试会再次加分。其幂等键又只由 operator/user/amount 构成，同一管理员日后对同一用户合法发放同额积分也会被错误视为同一操作（`apps/admin-service/src/admin-user/admin-user.service.ts:267-270`）。

### P0-4：支付 GRANT 的“补偿队列”不构成恢复机制

- 支付回调在 main 事务中先把 Order 置 PAID 并创建 UserPackage，提交后才调用 billing GRANT（`apps/order-service/src/order/order.service.ts:345-407`）。这个顺序合理，但缺少同事务 outbox。
- 失败时只写一个 TTL 7 天的 Redis key，并注释“补偿任务可通过 SCAN 捞取”（`apps/order-service/src/order/order.service.ts:417-451`）。仓库中该 key 只有生产者，没有实际扫描/重试消费者。
- 后续微信回调看到 PAID 会直接返回，不再触发 grant（`apps/order-service/src/order/order.service.ts:333-343`）。
- 即使补上 Redis consumer，legacy `LedgerService.grant` 仍有“main 已加分、billing 失败、重试再加分”的窗口，不能安全重放。
- 事务内双检使用普通 `findOne`，没有订单行锁或条件更新；`user_packages.order_id` 也无唯一约束，两个并发回调可能重复创建 UserPackage（`apps/order-service/src/order/order.service.ts:347-392`、`libs/database/src/migrations/main/0001_init_main.ts:291-319`）。billing key 可防两条流水，却不能防重复套餐记录。

### P1-1：当前 Billing Reconciliation 公式不成立，也无法修复

代码定义：

```text
expectedBalance = totalPoints - frozen
difference      = currentPoints - expectedBalance
```

实现见 `apps/billing-service/src/billing/reconciliation.service.ts:241-269`。该公式忽略 SETTLED 消耗和 CONSUME：

- GRANT 100 后 FREEZE 10：current=90、frozen=10，暂时看似一致。
- SETTLE 10 后：current 仍为 90、frozen 变 0，公式期望 100，必然误报。
- CONSUME 10 同样 current=90、frozen=0，必然误报。

虽然代码计算了 billing `SUM(amount)`，但只放进输出，完全不参与一致性判断（`apps/billing-service/src/billing/reconciliation.service.ts:244-263`）。而且当前 `amount` 同时表示“业务金额”和“余额变化”：FREEZE=-N、SETTLE=-N，但 SETTLE 对 currentPoints 的真实 delta 是 0，所以 `SUM(amount)` 本身也不能重建余额（`libs/database/src/entities/point-transaction.entity.ts:6-20`、`apps/billing-service/src/billing/ledger.service.ts:310-351`）。

增量对账只从 billing 流水找活跃 user（`apps/billing-service/src/billing/reconciliation.service.ts:296-305`），恰好漏掉“main 已提交但 billing insert 失败”的用户。任务仅 WARN 日志，不产生告警事件、修复工单或可重放命令（`apps/billing-service/src/billing/reconciliation.cron.ts:25-55`）。全量扫描使用 offset 分页并对每个用户串行发多次跨库查询（`apps/billing-service/src/billing/reconciliation.service.ts:108-142`），数据量增长后会慢且扫描快照不稳定。

### P1-2：模板 REWARD 对账按 count 推导缺失序号，会永久漏发

实时路径的 `useCount = useCount + 1 RETURNING` 和 `reward:template:{id}:use:{n}` 是正确的稳定业务键（`apps/template-service/src/template/template.service.ts:245-292`）。但补发逻辑只取 `rewardCount`，然后补 `(rewardCount, useCount]`（`apps/template-service/src/template/reward-reconciliation.service.ts:89-129`）。

反例：use=3，已成功 key 为 1 和 3，缺 key 2。`rewardCount=2`，reconciler 会再次调用 key 3；billing 幂等返回成功但 count 仍为 2，key 2 永远不补。扫描还固定只取 useCount 最大的前 500 个模板（`:75-82`），低热度模板可能长期饥饿。该 service 没有单元测试。

### P1-3：V2 outbox 正确性较好，但可运维性和公平性不足

1. **取批索引错位**：查询按 `deliveryStatus, updatedAt` 取前 100（`apps/billing-service/src/billing/credit-reservation.service.ts:147-168`），schema 索引却是 `deliveryStatus, createdAt`（`libs/database/src/entities/billing-projection-outbox.entity.ts:40-41`）。积压后会排序/扫描。
2. **terminal 饥饿**：terminal 在 FREEZE 未交付时直接返回 null，不更新 `updatedAt`（`apps/billing-service/src/billing/credit-reservation.service.ts:291-302`）。若前 100 个都是等待项，而失败 FREEZE 已被 defer 到较新的 updatedAt，等待 terminal 可永久占满批次，使其依赖的 FREEZE 无法再被选中。
3. **没有退避和死信**：outbox 只有 PENDING/DELIVERED，没有 attempts、nextAttemptAt、lastError、PROCESSING lease、poison/dead-letter 或人工 replay 状态（`libs/database/src/entities/billing-projection-outbox.entity.ts:17-89`）。失败只更新时间并每 15 秒重试（`apps/billing-service/src/billing/credit-reservation.service.ts:333-345`、`apps/billing-service/src/billing/billing-projection.cron.ts:12-18`）。
4. **长事务跨数据库调用**：projector 持有 main 行锁和事务时查询/写入 billing（`apps/billing-service/src/billing/credit-reservation.service.ts:273-330`）。billing 连接慢会占用 main 连接和锁。
5. **跨 reservation 无用户顺序**：只保证同 reservation 的 FREEZE 在 terminal 前；两个 reservation 的 fire-and-forget 投影可乱序。billing `balance` 快照和 `createdAt` 因而可能不符合 main 中实际余额顺序。
6. **幂等重放校验不完整**：重放只比较 user/type/amount/reservationId，没有比较 workId、balance snapshot 等（`apps/billing-service/src/billing/credit-reservation.service.ts:360-377`）。错误历史投影可能被标记 delivered。
7. **响应 ID 不稳定**：首次 terminal 可能返回 reservationId；投影完成后的相同请求返回 billing transactionId（`apps/billing-service/src/billing/credit-reservation.service.ts:121-137`、`:324-328`）。这削弱 API 幂等响应的字节级稳定性。
8. **无限增长**：没有 delivered outbox 归档/清理策略。

### P1-4：生成链路仍有 reservation 与业务状态的恢复空洞

- Work 创建、V2 freeze、把 reservation 写回 `Work.modelConfig` 是三个独立步骤。freeze 已成功但第二次 `workRepo.save` 失败时，catch 只把 Work 标 FAILED，不释放已经存在的 main reservation（`apps/workbench-service/src/workbench/generation.service.ts:245-273`）。reservation 有 workId，可恢复，但当前没有 scavenger/repair command。
- mock 模式直接把 Work/Task 标 COMPLETED，却没有 settle（`apps/workbench-service/src/workbench/generation.service.ts:614-635`），会留下 OPEN reservation。
- 真实成功路径先 settle，再更新 Work COMPLETED（`libs/temporal/src/workflows/video-generation.workflow.ts:301-318`）。如果 settle 已提交而 Work 更新失败，外层兜底会进入 failure 并尝试 release（`:221-239`、`:342-380`）；main reservation 已 SETTLED，release 会被拒绝。最终可能出现“已扣费但 Work 仍 PROCESSING/失败”的人工恢复状态。
- provider state unknown 时保留 reservation 是正确的 fail-closed 选择（`libs/temporal/src/workflows/video-generation.workflow.ts:440-495`），但没有定时查询 provider、终态化 reservation 和修复 Work 的闭环。
- 历史 Work fallback 会把只有 freezeId/idempotencyKey 的记录构造成 V2（`apps/workbench-service/src/workbench/generation.service.ts:789-804`），而 migration 又明确不回填历史 reservation。结果是安全地 fail closed，但没有可执行的 legacy 分类/对账工具。

### P1-5：schema 仍依赖应用代码维护关键不变量

- `users.current_points` / `total_points` 没有非负 CHECK（`libs/database/src/migrations/main/0001_init_main.ts:64-83`）。
- reservation migration 有 `amount > 0` 和 FK，这是好的；但没有 CHECK 保证 OPEN 时 terminal 字段全空、终态时 terminal key/time/balance 必填，也没有禁止终态回到 OPEN（`libs/database/src/migrations/main/0008_add_credit_reservations_and_billing_outbox.ts:23-40`）。
- billing `point_transactions` 没有 type/amount 符号约束、freezeId/reservationId/type 一致性约束或跨行引用 FK；`reservation_id` 只对 terminal 建唯一 partial index，没有“一条 reservation 只允许一个 FREEZE”的 billing 侧约束（`libs/database/src/migrations/billing/0001_init_billing.ts:19-40`、`libs/database/src/migrations/billing/0003_add_freeze_reference.ts:10-19`、`libs/database/src/migrations/billing/0004_add_reservation_id.ts:12-21`）。
- `description` DTO 允许 256 字符，而 DB 是 varchar(255)（`apps/billing-service/src/billing/dto/freeze-points.dto.ts:47-56`、`libs/database/src/entities/point-transaction.entity.ts:71-73`）。
- `PointTransaction` 只是单边流水和余额快照，并非代码注释所称的复式记账；没有 debit/credit accounts、balanced postings 或不可变性约束（`apps/billing-service/src/billing/ledger.service.ts:1-19`）。重构时应先修正术语和数据契约。

### P1-6：migration、备份和恢复不能证明跨库一致恢复

- migration runner 依次执行 main、billing、template、benchmark；每个数据库内部可事务化，但四库之间不原子（`libs/database/src/migration-runner.ts:43-101`）。V2 outbox 可缓冲 main 先升级/billing 后升级的短暂窗口，legacy 路径不能。
- deploy 脚本允许操作者在 migration 失败后继续，也会在没有 npx 时跳过 migration（`scripts/deploy.sh:225-240`），新代码可能在旧 schema 上启动。
- billing `AddRewardType.down` 先 DROP 仍被列依赖的 enum，再尝试改列类型，回滚顺序不可执行（`libs/database/src/migrations/billing/0002_add_reward_type.ts:29-43`）。
- 四库 backup 是四次顺序 `pg_dump`，不是同一逻辑时间点（`scripts/backup-db.sh:104-157`）。V2 可用 main 权威重建 billing，但 legacy operation 没有统一权威记录，跨库快照可能互相不对应。
- restore 只提示人工停服；DROP/CREATE 错误被 `|| true` 吞掉，`psql` 又未启用 `ON_ERROR_STOP=1`（`scripts/backup-db.sh:255-321`）。它可能在旧库上部分导入并仍报告成功。
- manifest 没有 checksum/schema version/LSN；仓库没有自动 restore drill 或 migration upgrade fixture 测试。

## 5. 分阶段重构建议

### Phase 0：先止血并建立可观测基线（P0，1-2 个迭代）

1. 修复 benchmark：为 freeze/settle/release 使用三个不同稳定 key；成功必须 settle；reservationId 和 key 持久化，补偿失败落 `billing_*_pending` durable 状态，不再依赖 7 天 Redis。
2. 修复 admin grant：由调用方提交真正的 adjustment/request UUID；不要向 uuid `order_id` 写伪值。幂等键必须绑定 adjustment ID，而不是 operator/user/amount。
3. 订单 PAID 事务内写 durable `credit_operation`/outbox；移除“只有生产者的 Redis retry key”。并给 `user_packages.order_id` 加唯一约束，支付回调用订单行锁或条件状态更新。
4. 暂停新增 legacy 调用；把 `reservationMode` 从调用方可选布尔值改为显式版本端点/服务端契约，避免静默降级。删除或修正未使用但仍会走 legacy 的 Temporal `freezeCredits`（`libs/temporal/src/activities/billing.activities.ts:66-94`）。
5. 增加指标和告警：PENDING 总数、oldest age、连续失败数、OPEN reservation age、terminal 无投影、paid-without-grant、completed-with-open-reservation。日志不是恢复机制。

### Phase 1：统一 main 权威积分操作（核心数据模型）

1. 将 `CreditReservation` 泛化为 main 中的 `CreditOperation` / `CreditReservation` 聚合：包含 operationId、subjectType/subjectId、userId、businessAmount、balanceDelta、reservedDelta、status、userSequence、request fingerprint。
2. 所有 main 余额变化（FREEZE/RELEASE/GRANT/REWARD/CONSUME）必须与权威 operation 和 outbox 同一 main 事务提交；SETTLE 记录 `balanceDelta=0, reservedDelta=-N`。billing 库只做不可变投影。
3. billing 接收来自 order/template/benchmark 的稳定 business event，先以 event ID 建 inbox/operation；重复 key 必须校验完整 fingerprint，不匹配即冲突，不能返回另一请求结果。
4. 对 template 这类源数据在独立 DB 的场景，在 template DB 建本地 outbox；billing 消费后在 main 事务应用 reward。不要用“总 count 推测缺哪个事件”。
5. 余额读以 main 为准；流水历史若展示 balance-after，必须按 main 分配的 `userSequence` 投影，或明确不把异步写入顺序当作余额时间线。

### Phase 2：重构 dispatcher、ledger schema 与并发协议

1. outbox 增加 `attempts/next_attempt_at/last_error/processing_owner/lease_until/DEAD`。用短 main 事务 `FOR UPDATE SKIP LOCKED` 批量 claim，释放事务后写 billing，再以 lease token CAS ack；billing 唯一 event ID 保持 crash-safe replay。
2. 选择“可执行事件”而不是先取 100 个再逐条发现依赖未满足；按 aggregate sequence 或 SQL eligibility 保证 FREEZE -> terminal，同时避免 blocked terminal 占满批次。
3. 为每用户/聚合定义顺序；明确 dispatcher 多副本、cron 重入和租约过期行为。Redis 锁若保留，使用随机 owner token + Lua compare-delete。
4. `PointTransaction` 拆分 `businessAmount`、`balanceDelta`、`reservedDelta`，增加 operation/event ID、user sequence、reference type/id、schema version。添加 type/sign/reference CHECK 和 V2 FREEZE 唯一约束。
5. 对 delivered outbox 制定保留和归档策略；给 poison event 提供鉴权的 inspect/replay/resolve 工具和审计日志。

### Phase 3：迁移、历史对账与恢复闭环

1. 先做只读 inventory：历史 OPEN FREEZE、无 terminal、V2 pending age、paid order 无 GRANT、completed benchmark/work 仍 OPEN、billing projection 无 main operation、main operation 无 billing projection。
2. 遵守现有正确原则：历史关联不可由 description/金额猜测。无法证明的一律进入人工 reconciliation case；每个修复以新的 adjustment ID 记账并可审计。
3. 使用 expand -> dual-read/verify -> switch -> contract。每一步都能与前一版应用兼容；deploy 遇 migration 失败必须 fail closed，不允许交互式“继续”。
4. backup/restore 改为停写窗口或可证明的一致快照；至少为每库记录 checksum、schema migration version、时间/LSN。恢复到新实例，`psql -v ON_ERROR_STOP=1`，完成跨库 invariant 校验后再切流，不原地吞错恢复。
5. 对历史 provider unknown、settled-but-work-incomplete、release-pending 建 durable case 状态与幂等恢复命令；恢复动作必须可重复运行。

## 6. 验证标准

### 6.1 真实数据库与故障注入

- 用 PostgreSQL 16 启动真实 main/billing 两库，不使用 Repository mock。
- 对每种 operation 在以下边界注入崩溃：main commit 前、main commit 后/billing 前、billing insert 后/ack 前、ack 后/响应前。
- 每次重启并重放后验证：main 余额恰好一次、权威 operation 恰好一条、billing event 恰好一条、outbox 最终 DELIVERED；禁止依赖 Redis 数据仍存在。
- 32+ 并发 freeze 不超扣；同 reservation 并发 settle/release 最终只有一个终态；相同 key 同参数返回同一稳定响应，不同参数返回明确 conflict。
- 人为制造 100+ blocked terminal 与失败 FREEZE，恢复 billing 后所有 eligible 事件在 SLA 内排空，不能饥饿。
- 两个 billing-service/projector 实例并发、cron 重入、lease 过期和进程 kill 均不重复记账。

### 6.2 业务闭环

- benchmark：成功=SETTLED；失败/已确认取消=RELEASED；provider unknown=OPEN + durable pending；Redis 清空和超过 7 天后仍可恢复。
- payment：并发重复回调只产生一个 UserPackage、一个 GRANT；billing outage 后由 durable outbox 自动恢复。
- admin：两个不同 adjustment ID 的同额调账都生效；同 adjustment 重试只生效一次；不会向 UUID 列写哨兵字符串。
- template：构造已存在 use keys `{1,3}`、缺 `{2}`，reconciler 必须只补 2；500+ 模板也有游标和最终公平性。
- generation：freeze 后 Work metadata 保存失败可自动释放/恢复；settle 后 Work 更新失败可依据 reservation/provider 终态修复为一致状态；mock 模式不留下 OPEN。

### 6.3 对账与迁移

- 一致样本覆盖 OPEN、SETTLED、RELEASED、GRANT、REWARD、CONSUME，reconciliation 必须零误报。
- 删除一个 billing projection、篡改 amount/balance/reference、制造 paid-without-grant，reconciliation 必须逐项定位具体 operation ID，而非只报告用户总差额。
- fresh install 和从脱敏历史快照 upgrade 都运行 migration；验证约束、索引和 enum。回滚采用已演练的 forward fix/restore，不依赖当前损坏的 down。
- 自动 restore drill 必须验证 checksum、migration version、四库关键 invariant 和 projector 可重建性。

## 7. 测试缺口说明

- 当前 51 个 billing tests 证明应用分支和 mock 调用关系，但没有真实 partial unique index、row lock、deadlock、跨库 commit gap 或 crash replay。
- `credit-reservation.service.spec.ts` 覆盖同事务写、terminal 幂等、FREEZE-before-terminal、billing 写后 ack 重放和 skip-locked（`apps/billing-service/src/billing/credit-reservation.service.spec.ts:81-301`），但没有真实并发、投影饥饿、per-user 顺序、response ID 稳定性。
- billing API 集成测试实际只验证 GRANT 和 legacy FREEZE；文件头虽宣称 settle/release，正文没有 terminal 用例，也没有 `reservationMode: true` 的 V2 数据库闭环（`tests/integration/api/billing.api.spec.ts:1-17`、`:80-193`）。
- `ReconciliationService`、`ReconciliationCron`、`BillingProjectionCron`、`RewardReconciliationService` 和 migrations 没有对应的真实数据/单元测试。

## 8. 总体判断

V2 `CreditReservation + BillingProjectionOutbox` 已经建立了正确的主原则：**main 是余额与 reservation 的权威，billing 是幂等异步投影**。它显著降低了生成链路的重复退款和双终态风险，应作为重构基础，而不是推倒重来。

当前不能宣称“计费已具备全局 exactly-once”或“对账可恢复”。V2 只覆盖 workbench 生成；benchmark、订单/管理员 GRANT、模板 REWARD 和遗留操作仍处在不可原子恢复的双写模型中。优先级应是先修四类 P0（遗留双写、benchmark key/终态、admin fake UUID、支付 durable outbox），再统一所有积分变化的 main 权威 operation，最后重构投影、对账与恢复工具。
