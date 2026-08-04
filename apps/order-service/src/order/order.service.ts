/**
 * OrderService — 订单业务编排
 *
 * 职责：
 *  1. 创建订单：校验套餐 → 生成订单号 → 落库 PENDING → 调起微信支付 → 返回支付参数
 *  2. 查询订单：列表分页 / 详情（校验所有权）
 *  3. 取消订单：仅 PENDING 状态可取消
 *  4. 处理支付回调：验签+解密（委托适配器）→ durable inbox 落库 → 字段绑定校验 →
 *     幂等更新订单状态 → 创建 UserPackage → 调用 billing grant
 *
 * 幂等机制：
 *  - 创建订单：基于 idempotencyKey 在 Redis 缓存结果（24h）
 *  - 支付回调：基于 OrderPaymentEvent.transactionId 唯一约束（durable inbox）
 *    * 重复回调 → 查询到已 PROCESSED 的事件 → 幂等返回
 *    * 并发回调 → 第二个插入因唯一约束失败 → 幂等返回
 *
 * 零状态变更：
 *  - 字段绑定校验失败（appid/mchid/amount/currency 不匹配）→ 事件标记 FAILED，订单不更新
 *  - 订单不存在 → 事件落库（orderId=null），返回 processed=false
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { BusinessException, ErrorCode, generateIdempotencyKey } from '@reelclone/common'
import {
  CreditOperationOutbox,
  DATABASE_CONNECTIONS,
  Order,
  OrderPaymentEvent,
  OrderStatus,
  OutboxStatus,
  Package,
  PackageStatus,
  PaymentEventStatus,
  PaymentMethod,
  REDIS_CLIENT,
  User,
  UserPackage,
  UserPackageStatus,
} from '@reelclone/database'
import { BillingClient } from './billing.client'
import { CreateOrderDto } from './dto/create-order.dto'
import { ListOrdersDto } from './dto/list-orders.dto'
import { WechatPayService } from './wechat-pay.service'
import { ProfitSharingService } from '../profit-sharing/profit-sharing.service'
import { v4 as uuidv4 } from 'uuid'

/** 创建订单响应 */
export interface CreateOrderResult {
  orderId: string
  orderNo: string
  paymentParams: {
    timeStamp: string
    nonceStr: string
    package: string
    signType: 'RSA'
    paySign: string
  }
}

/** 订单列表分页结果 */
export interface PaginatedOrders {
  list: Order[]
  page: number
  pageSize: number
  total: number
}

/** 支付回调处理结果 */
export interface HandleCallbackResult {
  processed: boolean
  orderId: string
  orderNo: string
}

/** 幂等结果缓存 TTL（秒） */
const IDEMPOTENCY_RESULT_TTL = 86400

/** 短期去重缓存 TTL（秒，5 分钟）：避免 webhook 重复回调立即重放 grant。
 *  真正的 durability 由 credit_operation_outbox 保证，此处仅作短期去重。 */
const GRANT_DEDUP_TTL = 300

/** 缓存键：创建订单幂等结果 */
const createOrderIdemKey = (key: string) => `order:create:idem:${key}`

/** 缓存键：订单赠送积分短期去重（webhook 重复回调保护） */
const grantDedupKey = (orderId: string) => `order:grant:retry:${orderId}`

/**
 * 订单服务
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name)

  constructor(
    @InjectRepository(Order, DATABASE_CONNECTIONS.MAIN)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Package, DATABASE_CONNECTIONS.MAIN)
    private readonly packageRepo: Repository<Package>,
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
    @InjectRepository(OrderPaymentEvent, DATABASE_CONNECTIONS.MAIN)
    private readonly paymentEventRepo: Repository<OrderPaymentEvent>,
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly wechatPay: WechatPayService,
    private readonly billingClient: BillingClient,
    private readonly profitSharingService: ProfitSharingService,
  ) {}

  // -------------------- 创建订单 --------------------

  /**
   * 创建订单
   *
   * 流程：
   *  1. 幂等检查：若 idempotencyKey 已有缓存结果，直接返回
   *  2. 校验套餐存在且为 ACTIVE 状态
   *  3. 生成订单号 RC + yyyyMMddHHmmss + 6位随机数
   *  4. 落库订单（status=PENDING, paymentMethod=WECHAT）
   *  5. 调用微信支付生成支付参数
   *  6. 缓存幂等结果
   *
   * @param userId 用户 ID
   * @param dto 创建订单 DTO
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<CreateOrderResult> {
    // 幂等键：客户端提供 or 服务端生成
    const idempotencyKey =
      dto.idempotencyKey ??
      generateIdempotencyKey(userId, 'create_order', { packageId: dto.packageId })

    // 1. 幂等检查
    const cached = await this.redis.get(createOrderIdemKey(idempotencyKey))
    if (cached) {
      this.logger.log(`创建订单幂等命中: ${idempotencyKey}`)
      return JSON.parse(cached) as CreateOrderResult
    }

    // 2. 校验套餐
    const pkg = await this.packageRepo.findOne({ where: { id: dto.packageId } })
    if (!pkg) {
      throw BusinessException.notFound('套餐', { packageId: dto.packageId })
    }
    if (pkg.status !== PackageStatus.ACTIVE) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '套餐已下架，无法购买', {
        packageId: dto.packageId,
        status: pkg.status,
      })
    }

    // 3. 获取用户 openid（用于微信支付）
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) {
      throw BusinessException.notFound('用户', { userId })
    }

    // 4. 生成订单号
    const orderNo = this.generateOrderNo()

    // 5. 落库订单（PENDING）
    const order = this.orderRepo.create({
      id: uuidv4(),
      userId,
      packageId: pkg.id,
      orderNo,
      amount: Number(pkg.price),
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.WECHAT,
      transactionId: null,
      paidAt: null,
      cancelledAt: null,
    })
    await this.orderRepo.save(order)

    // 6. 调起微信支付
    let paymentParams
    try {
      paymentParams = await this.wechatPay.createPaymentParams({
        orderNo,
        amount: Number(pkg.price),
        description: pkg.name,
        openid: user.openId,
      })
    } catch (err) {
      // 支付调起失败：将订单标记为取消（避免遗留 PENDING）
      this.logger.error(`微信支付调起失败，订单 ${orderNo} 将被取消: ${(err as Error).message}`)
      await this.orderRepo.update(order.id, {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
      })
      throw BusinessException.paymentFailed(`微信支付调起失败: ${(err as Error).message}`)
    }

    const result: CreateOrderResult = {
      orderId: order.id,
      orderNo,
      paymentParams,
    }

    // 7. 缓存幂等结果
    await this.redis.set(
      createOrderIdemKey(idempotencyKey),
      JSON.stringify(result),
      'EX',
      IDEMPOTENCY_RESULT_TTL,
    )

    return result
  }

  // -------------------- 查询：列表 --------------------

  /**
   * 订单列表（分页 + 状态筛选）
   */
  async findAll(userId: string, dto: ListOrdersDto): Promise<PaginatedOrders> {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 20

    const qb = this.orderRepo.createQueryBuilder('o').where('o.userId = :userId', { userId })

    if (dto.status) {
      qb.andWhere('o.status = :status', { status: dto.status })
    }

    qb.orderBy('o.createdAt', 'DESC')
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()
    return { list, page, pageSize, total }
  }

  // -------------------- 查询：详情 --------------------

  /**
   * 订单详情（校验所有权）
   */
  async findOne(userId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } })
    if (!order) {
      throw BusinessException.notFound('订单', { orderId })
    }
    if (order.userId !== userId) {
      // 出于安全考虑，无权访问时也返回 NOT_FOUND（不暴露存在性）
      throw BusinessException.notFound('订单', { orderId })
    }
    return order
  }

  /**
   * 通过订单号查询订单（供 webhook 使用）
   */
  async findByOrderNo(orderNo: string): Promise<Order | null> {
    return this.orderRepo.findOne({ where: { orderNo } })
  }

  // -------------------- 取消订单 --------------------

  /**
   * 取消订单（仅 PENDING 状态可取消）
   */
  async cancel(userId: string, orderId: string): Promise<Order> {
    const order = await this.findOne(userId, orderId)

    if (order.status !== OrderStatus.PENDING) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        `订单当前状态为 ${order.status}，无法取消`,
        { orderId, status: order.status },
      )
    }

    order.status = OrderStatus.CANCELLED
    order.cancelledAt = new Date()
    await this.orderRepo.save(order)

    return order
  }

  // -------------------- 支付回调处理 --------------------

  /**
   * 处理微信支付回调
   *
   * 流程（durable inbox + 字段绑定 + 零状态变更）：
   *  1. 委托适配器验签 + 解密（verifyAndDecryptCallback）
   *  2. transaction_id 幂等检查（durable inbox）：
   *     - 查询 OrderPaymentEvent by transactionId
   *     - 已存在且 PROCESSED → 幂等返回（零状态变更）
   *     - 不存在 → 插入新事件（RECEIVED），唯一约束保证并发安全
   *  3. 非 SUCCESS 状态 → 标记事件 + 返回（零状态变更）
   *  4. 查找订单（out_trade_no）→ 不存在则标记事件 + 返回（零状态变更）
   *  5. 字段绑定校验（appid/mchid/amount/currency）：
   *     - 不匹配 → 事件标记 FAILED + 返回（零状态变更，资金安全）
   *  6. 事务化：
   *     a. 更新订单 status=PAID, transactionId, paidAt
   *     b. 创建 UserPackage
   *     c. 写入 CreditOperationOutbox（B5: durable grant 意图，仅 outbox）
   *     d. 更新 OrderPaymentEvent status=PROCESSED
   *  7. 事务提交后 best-effort 调用 billing-service /grant 赠送积分
   *
   * @param payload 回调报文（headers + rawBody）
   * @returns 处理结果
   */
  async handleCallback(payload: {
    headers: Record<string, string | string[] | undefined>
    rawBody: string
  }): Promise<HandleCallbackResult> {
    // 1. 委托适配器验签 + 解密
    const { verified, notification, decrypted } = await this.wechatPay.verifyAndDecryptCallback(
      payload.headers,
      payload.rawBody,
    )

    if (!verified) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '微信支付回调签名校验失败', undefined)
    }

    // 提取回调元信息
    const eventType = notification.body?.event_type ?? null
    const notificationId = notification.body?.id ?? null

    // 2. 解密结果为空（验签通过但无 resource，如非支付类通知）
    if (!decrypted) {
      this.logger.warn(
        `回调验签通过但无解密结果: eventType=${eventType} notificationId=${notificationId}`,
      )
      return {
        processed: false,
        orderId: '',
        orderNo: '',
      }
    }

    const result = decrypted

    // 3. transaction_id 幂等检查（durable inbox）
    //    同一微信支付流水号的事件不会被重复处理
    const existingEvent = await this.paymentEventRepo.findOne({
      where: { transactionId: result.transaction_id },
    })
    if (existingEvent) {
      this.logger.log(
        `回调幂等返回: transactionId=${result.transaction_id} status=${existingEvent.status}`,
      )
      return {
        processed: false,
        orderId: existingEvent.orderId ?? '',
        orderNo: existingEvent.orderNo,
      }
    }

    // 4. 落库支付事件（durable inbox，RECEIVED 状态）
    //    唯一约束保证并发回调时只有一个插入成功
    const paymentEvent = this.paymentEventRepo.create({
      id: uuidv4(),
      orderId: null,
      orderNo: result.out_trade_no,
      transactionId: result.transaction_id,
      eventType,
      notificationId,
      rawBody: payload.rawBody,
      verified: true,
      status: PaymentEventStatus.RECEIVED,
      decryptResult: result as unknown as Record<string, unknown>,
      errorMessage: null,
      processedAt: null,
    })
    try {
      await this.paymentEventRepo.save(paymentEvent)
    } catch (err) {
      // 唯一约束冲突：并发回调，另一个请求已先落库 → 幂等返回
      this.logger.log(
        `并发回调幂等返回（唯一约束冲突）: transactionId=${result.transaction_id} err=${(err as Error).message}`,
      )
      return {
        processed: false,
        orderId: '',
        orderNo: result.out_trade_no,
      }
    }

    // 5. 非 SUCCESS 状态 → 标记事件 + 返回（零状态变更）
    if (result.trade_state !== 'SUCCESS') {
      this.logger.warn(
        `收到非 SUCCESS 状态回调: orderNo=${result.out_trade_no} state=${result.trade_state}`,
      )
      await this.paymentEventRepo.update(paymentEvent.id, {
        status: PaymentEventStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: `non-SUCCESS state: ${result.trade_state}`,
      })
      return {
        processed: false,
        orderId: '',
        orderNo: result.out_trade_no,
      }
    }

    // 6. 查找订单
    const order = await this.findByOrderNo(result.out_trade_no)
    if (!order) {
      this.logger.warn(`回调对应订单不存在: ${result.out_trade_no}`)
      await this.paymentEventRepo.update(paymentEvent.id, {
        status: PaymentEventStatus.FAILED,
        processedAt: new Date(),
        errorMessage: `order not found: ${result.out_trade_no}`,
      })
      return {
        processed: false,
        orderId: '',
        orderNo: result.out_trade_no,
      }
    }

    // 关联订单 ID
    await this.paymentEventRepo.update(paymentEvent.id, { orderId: order.id })

    // 7. 字段绑定校验（零状态变更：不匹配则标记 FAILED 并返回）
    const bindingError = this.verifyFieldBinding(result, order)
    if (bindingError) {
      this.logger.error(`字段绑定校验失败: orderNo=${order.orderNo} error=${bindingError}`)
      await this.paymentEventRepo.update(paymentEvent.id, {
        status: PaymentEventStatus.FAILED,
        processedAt: new Date(),
        errorMessage: bindingError,
      })
      // 零状态变更：订单不更新，返回 processed=false
      return {
        processed: false,
        orderId: order.id,
        orderNo: order.orderNo,
      }
    }

    // 8. 幂等检查：订单已 PAID 直接返回
    if (order.status === OrderStatus.PAID) {
      this.logger.log(
        `订单 ${order.orderNo} 已 PAID，回调幂等返回（transactionId=${order.transactionId}）`,
      )
      await this.paymentEventRepo.update(paymentEvent.id, {
        status: PaymentEventStatus.DUPLICATED,
        processedAt: new Date(),
      })
      return {
        processed: false,
        orderId: order.id,
        orderNo: order.orderNo,
      }
    }

    // 9. 事务化更新订单 + 创建 UserPackage + 写入 outbox + 更新事件状态
    //    注意：billing-service grant 调用放在事务外执行（避免长事务持锁 + 网络抖动回滚）
    const grantContext = await this.mainDataSource.transaction(async (manager) => {
      // 双重检查：在事务内再次确认状态（防止并发回调）
      const fresh = await manager.findOne(Order, { where: { id: order.id } })
      if (!fresh || fresh.status === OrderStatus.PAID) {
        return null
      }

      const now = new Date()
      const paidAt = result.success_time ? new Date(result.success_time) : now

      // 9a. 更新订单
      fresh.status = OrderStatus.PAID
      fresh.transactionId = result.transaction_id
      fresh.paidAt = paidAt
      await manager.save(fresh)

      // 9b. 查找套餐（获取 points / bonusPoints / duration）
      const pkg = await manager.findOne(Package, {
        where: { id: fresh.packageId },
      })
      if (!pkg) {
        this.logger.error(
          `订单 ${fresh.orderNo} 对应套餐 ${fresh.packageId} 不存在，跳过 UserPackage 创建`,
        )
        return null
      }

      // 9c. 创建 UserPackage
      const totalPoints = Number(pkg.points) + Number(pkg.bonusPoints)
      const durationDays = Number(pkg.duration) || 30
      const expiredAt = new Date(now)
      expiredAt.setDate(expiredAt.getDate() + durationDays)

      const userPackage = manager.create(UserPackage, {
        id: uuidv4(),
        userId: fresh.userId,
        packageId: pkg.id,
        orderId: fresh.id,
        pointsTotal: totalPoints,
        pointsUsed: 0,
        pointsRemaining: totalPoints,
        status: UserPackageStatus.ACTIVE,
        startedAt: now,
        expiredAt,
      })
      await manager.save(userPackage)

      // 9d. B5: 仅写入 CreditOperationOutbox（不再写 CreditOperation）
      //     由 billing-service 在执行 grant 时创建权威的 CreditOperation。
      //     order-service 只负责投递"意图"，避免 main/billing 两库双重写入。
      const operationId = `order-grant:${fresh.id}`
      const idempotencyKey = `order:${fresh.id}:grant`

      const outbox = manager.create(CreditOperationOutbox, {
        id: uuidv4(),
        operationId,
        creditOperationId: undefined,
        status: OutboxStatus.PENDING,
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        eventPayload: {
          type: 'GRANT',
          relatedOrderId: fresh.id,
          userId: fresh.userId,
          packageId: pkg.id,
          amount: totalPoints,
          idempotencyKey,
          orderNo: fresh.orderNo,
        },
      })
      await manager.save(outbox)

      // 9e. 更新支付事件状态为 PROCESSED
      await manager.update(
        OrderPaymentEvent,
        { id: paymentEvent.id },
        {
          status: PaymentEventStatus.PROCESSED,
          processedAt: now,
        },
      )

      // 返回事务外执行 grant 所需的上下文
      return {
        orderId: fresh.id,
        orderNo: fresh.orderNo,
        userId: fresh.userId,
        packageId: pkg.id,
        totalPoints,
        outboxId: outbox.id,
        operationIdempotencyKey: idempotencyKey,
      }
    })

    // 10. 事务提交后 best-effort 调用 billing-service 赠送积分
    //     失败不阻塞回调（避免微信重试），outbox（PENDING）由 OutboxConsumer 捞取重试
    if (grantContext) {
      await this.invokeGrantWithCompensation(grantContext)
    }

    // 11. 事务提交后 best-effort 发起分账（失败不阻塞回调）
    //     分账由 ProfitSharingService 独立管理重试，此处仅触发首次尝试
    this.profitSharingService
      .initiateProfitSharing({
        orderId: order.id,
        orderNo: order.orderNo,
        transactionId: result.transaction_id,
        totalAmountYuan: Number(order.amount),
      })
      .catch((err) => {
        this.logger.error(
          `分账触发失败（best-effort）: orderNo=${order.orderNo} error=${(err as Error).message}`,
        )
      })

    return {
      processed: true,
      orderId: order.id,
      orderNo: order.orderNo,
    }
  }

  /**
   * 字段绑定校验：解密结果与本地订单的一致性
   *
   * 校验项（任一不匹配返回错误消息，调用方必须零状态变更）：
   *  - appid: 与本地配置一致（Mock 模式跳过）
   *  - mchid: 与本地配置一致（Mock 模式跳过）
   *  - amount.total: 与订单金额（分）一致
   *  - currency: CNY
   *
   * @param result 解密后的支付结果
   * @param order 本地订单
   * @returns 不匹配时返回错误消息，匹配时返回 null
   */
  private verifyFieldBinding(
    result: { appid?: string; mchid?: string; amount?: { total?: number; currency?: string } },
    order: Order,
  ): string | null {
    // Mock 模式跳过 appid/mchid 校验（Mock 适配器不返回这些字段）
    if (!this.wechatPay.isMockMode()) {
      const expectedAppId = process.env.WECHAT_PAY_APPID ?? ''
      const expectedMchId = process.env.WECHAT_PAY_MCHID ?? ''

      if (result.appid && result.appid !== expectedAppId) {
        return `appid 不匹配: expected=${expectedAppId} actual=${result.appid}`
      }
      if (result.mchid && result.mchid !== expectedMchId) {
        return `mchid 不匹配: expected=${expectedMchId} actual=${result.mchid}`
      }
    }

    // 金额校验（元 → 分）
    const expectedTotal = Math.round(Number(order.amount) * 100)
    const actualTotal = result.amount?.total
    if (actualTotal !== undefined && actualTotal !== expectedTotal) {
      return `amount.total 不匹配: expected=${expectedTotal} actual=${actualTotal}`
    }

    // 币种校验
    const actualCurrency = result.amount?.currency
    if (actualCurrency !== undefined && actualCurrency !== 'CNY') {
      return `currency 不匹配: expected=CNY actual=${actualCurrency}`
    }

    return null
  }

  /**
   * 调用 billing-service 赠送积分，成功后标记 outbox 已投递；失败写入短期去重缓存
   *
   * 设计权衡：
   *  - 订单已支付成功，回调必须返回成功避免微信重试
   *  - 事务内已写入 Outbox（PENDING）作为 durable 保障（B5: 仅 outbox，不写 CreditOperation）
   *  - 此处在事务外做一次 best-effort grant（降低延迟）
   *    * 成功 → 标记 outbox=DELIVERED
   *    * 失败 → 不再阻塞，outbox 维持 PENDING，由 outbox.consumer 定期捞取重试
   *  - grant 的幂等键保证 billing-service 可安全重放（即时调用与 consumer 重放不会重复入账）
   *  - Redis key 仅作 5 分钟短期去重缓存，防止 webhook 重复回调立即重放
   */
  private async invokeGrantWithCompensation(ctx: {
    orderId: string
    orderNo: string
    userId: string
    packageId: string
    totalPoints: number
    outboxId: string
    operationIdempotencyKey: string
  }): Promise<void> {
    const grantParams = {
      userId: ctx.userId,
      amount: ctx.totalPoints,
      idempotencyKey: ctx.operationIdempotencyKey,
      orderId: ctx.orderId,
      packageId: ctx.packageId,
    }

    try {
      await this.billingClient.grant(grantParams)
      // 即时投递成功：标记 outbox 为终态
      await this.markGrantDelivered(ctx.outboxId)
      this.logger.log(`订单 ${ctx.orderNo} paid-grant 即时投递成功，已标记 outbox=DELIVERED`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `订单 ${ctx.orderNo} 即时 billing grant 失败，已交由 outbox consumer 重试: ${errMsg}`,
      )
      // 写入短期去重缓存（5 分钟），避免 webhook 重复回调立即重放
      // 真正的 durability 由 credit_operation_outbox（PENDING）保证
      await this.redis.set(
        grantDedupKey(ctx.orderId),
        JSON.stringify({ error: errMsg, ts: Date.now() }),
        'EX',
        GRANT_DEDUP_TTL,
      )
    }
  }

  /**
   * 即时 grant 成功后，将 Outbox 标记为 DELIVERED。
   * B5: 不再更新 CreditOperation（由 billing-service 管理）。
   * 单独的异常不阻塞主流程（最坏情况下 consumer 会幂等重放并补齐状态）。
   */
  private async markGrantDelivered(outboxId: string): Promise<void> {
    try {
      await this.mainDataSource.getRepository(CreditOperationOutbox).update(
        { id: outboxId },
        {
          status: OutboxStatus.DELIVERED,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      )
    } catch (err) {
      // 标记失败不阻塞：consumer 会基于 outbox PENDING 幂等重放并补齐 DELIVERED
      this.logger.warn(
        `标记 outbox ${outboxId} 为 DELIVERED 失败（consumer 会补齐）: ${(err as Error).message}`,
      )
    }
  }

  // -------------------- 工具方法 --------------------

  /**
   * 生成订单号: RC + yyyyMMddHHmmss + 6位随机数字
   */
  private generateOrderNo(): string {
    const now = new Date()
    const pad = (n: number, len = 2) => n.toString().padStart(len, '0')
    const yyyy = now.getFullYear()
    const MM = pad(now.getMonth() + 1)
    const dd = pad(now.getDate())
    const HH = pad(now.getHours())
    const mm = pad(now.getMinutes())
    const ss = pad(now.getSeconds())
    const random = Math.floor(100000 + Math.random() * 900000).toString()
    return `RC${yyyy}${MM}${dd}${HH}${mm}${ss}${random}`
  }
}
