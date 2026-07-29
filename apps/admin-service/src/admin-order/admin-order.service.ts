/**
 * AdminOrderService — 管理后台订单业务编排
 *
 * 职责：
 *  1. 全平台订单列表（分页 + 多条件筛选：status / userId / 创建时间范围）
 *  2. 订单退款（敏感操作，需记录操作者 ID + 时间戳 + 退款原因）
 *
 * 退款流程：
 *  1. 校验订单存在且状态为 PAID（仅 PAID 可退款）
 *  2. 加载套餐获取需扣回的积分数（points + bonusPoints）
 *  3. 更新 Order.status 为 REFUNDED
 *  4. 记录退款日志（操作者 ID + 时间戳 + 退款原因）
 *  5. 调用 billing-service /api/v1/points/deduct 扣回积分（携带 INTERNAL_API_KEY）
 *  6. 调用 order-service /api/v1/orders/:id/refund 发起微信退款（携带 INTERNAL_API_KEY）
 *
 * 跨服务调用为 best-effort：下游失败时记录错误日志但不回滚订单状态，
 * 返回值中标记各步骤执行结果，供运营人员跟进（避免遗留 PAID 订单无法退款）。
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BusinessException, ErrorCode } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  Order,
  OrderStatus,
  Package,
  PaymentMethod,
} from '@reelclone/database'
import { ListOrdersDto } from './dto/list-orders.dto'
import { RefundOrderDto } from './dto/refund-order.dto'

/** 管理后台订单列表项（精简字段） */
export interface AdminOrderListItem {
  id: string
  userId: string
  packageId: string
  amount: number
  status: OrderStatus
  paymentMethod: PaymentMethod | null
  createdAt: Date
}

/** 分页订单列表结果 */
export interface PaginatedAdminOrders {
  list: AdminOrderListItem[]
  page: number
  pageSize: number
  total: number
}

/** 退款结果 */
export interface RefundResult {
  /** 退款后的订单 */
  order: Order
  /** 积分是否扣回成功 */
  pointsDeducted: boolean
  /** 微信退款是否发起成功 */
  wechatRefundInitiated: boolean
}

@Injectable()
export class AdminOrderService {
  private readonly logger = new Logger(AdminOrderService.name)

  /** billing-service 基础地址 */
  private readonly billingServiceUrl: string
  /** order-service 基础地址 */
  private readonly orderServiceUrl: string
  /** 内部 API Key */
  private readonly internalApiKey: string

  constructor(
    @InjectRepository(Order, DATABASE_CONNECTIONS.MAIN)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Package, DATABASE_CONNECTIONS.MAIN)
    private readonly packageRepo: Repository<Package>,
  ) {
    this.billingServiceUrl = (
      process.env.BILLING_SERVICE_URL ?? 'http://billing-service:3006'
    ).replace(/\/$/, '')
    this.orderServiceUrl = (process.env.ORDER_SERVICE_URL ?? 'http://order-service:3005').replace(
      /\/$/,
      '',
    )
    this.internalApiKey = process.env.INTERNAL_API_KEY ?? ''
  }

  // -------------------- 订单列表 --------------------

  /**
   * 全平台订单列表（分页 + 多条件筛选）
   *
   * 返回精简字段：id / userId / packageId / amount / status / paymentMethod / createdAt
   */
  async findAll(dto: ListOrdersDto): Promise<PaginatedAdminOrders> {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 20

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .select([
        'o.id',
        'o.userId',
        'o.packageId',
        'o.amount',
        'o.status',
        'o.paymentMethod',
        'o.createdAt',
      ])

    if (dto.status) {
      qb.andWhere('o.status = :status', { status: dto.status })
    }
    if (dto.userId) {
      qb.andWhere('o.userId = :userId', { userId: dto.userId })
    }
    if (dto.startDate) {
      qb.andWhere('o.createdAt >= :startDate', {
        startDate: new Date(dto.startDate),
      })
    }
    if (dto.endDate) {
      qb.andWhere('o.createdAt <= :endDate', {
        endDate: new Date(dto.endDate),
      })
    }

    qb.orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [rows, total] = await qb.getManyAndCount()

    return {
      list: rows as unknown as AdminOrderListItem[],
      page,
      pageSize,
      total,
    }
  }

  // -------------------- 订单退款 --------------------

  /**
   * 订单退款（敏感操作）
   *
   * 流程：
   *  1. 校验订单存在且状态为 PAID
   *  2. 加载套餐获取需扣回的积分数
   *  3. 更新订单状态为 REFUNDED
   *  4. 记录退款日志（操作者 + 时间戳 + 原因）
   *  5. 调用 billing-service 扣回积分（best-effort）
   *  6. 调用 order-service 发起微信退款（best-effort）
   *
   * @param orderId 订单 ID
   * @param dto 退款 DTO（含退款原因）
   * @param operatorId 操作者用户 ID（来自 @CurrentUser）
   */
  async refund(orderId: string, dto: RefundOrderDto, operatorId: string): Promise<RefundResult> {
    // 1. 校验订单存在
    const order = await this.orderRepo.findOne({ where: { id: orderId } })
    if (!order) {
      throw BusinessException.notFound('订单', { orderId })
    }

    // 2. 校验订单状态必须为 PAID
    if (order.status !== OrderStatus.PAID) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        `订单当前状态为 ${order.status}，仅 PAID 状态订单可退款`,
        { orderId, status: order.status },
      )
    }

    // 3. 加载套餐获取需扣回的积分数（points + bonusPoints）
    const pkg = await this.packageRepo.findOne({
      where: { id: order.packageId },
    })
    const pointsToDeduct = pkg ? Number(pkg.points) + Number(pkg.bonusPoints) : 0
    if (!pkg) {
      this.logger.warn(`订单 ${orderId} 对应套餐 ${order.packageId} 不存在，扣回积分数为 0`)
    }

    // 4. 更新订单状态为 REFUNDED
    order.status = OrderStatus.REFUNDED
    await this.orderRepo.save(order)

    // 5. 记录退款日志（操作者 ID + 时间戳 + 退款原因）
    const refundTimestamp = new Date().toISOString()
    this.logger.log(
      `退款操作: orderId=${orderId} operatorId=${operatorId} reason=${dto.reason} timestamp=${refundTimestamp} pointsToDeduct=${pointsToDeduct}`,
    )

    // 6. 调用 billing-service 扣回积分（best-effort）
    let pointsDeducted = false
    try {
      await this.deductPoints(order.userId, pointsToDeduct, orderId, dto.reason)
      pointsDeducted = true
    } catch (err) {
      this.logger.error(
        `退款扣回积分失败（订单已标记 REFUNDED，需人工跟进）: orderId=${orderId} error=${(err as Error).message}`,
      )
    }

    // 7. 调用 order-service 发起微信退款（best-effort）
    let wechatRefundInitiated = false
    try {
      await this.invokeWechatRefund(orderId, dto.reason)
      wechatRefundInitiated = true
    } catch (err) {
      this.logger.error(
        `调用 order-service 微信退款失败（订单已标记 REFUNDED，需人工跟进）: orderId=${orderId} error=${(err as Error).message}`,
      )
    }

    return { order, pointsDeducted, wechatRefundInitiated }
  }

  // -------------------- 跨服务调用 --------------------

  /**
   * 调用 billing-service 扣回积分
   *
   * 端点: POST {BILLING_SERVICE_URL}/api/v1/points/deduct
   * Headers: x-api-key: ${INTERNAL_API_KEY}
   */
  private async deductPoints(
    userId: string,
    amount: number,
    orderId: string,
    reason: string,
  ): Promise<void> {
    if (!this.internalApiKey) {
      throw new Error('INTERNAL_API_KEY 未配置，无法调用 billing-service')
    }

    const url = `${this.billingServiceUrl}/api/v1/points/deduct`
    const body = {
      userId,
      amount,
      idempotencyKey: `order:${orderId}:refund`,
      orderId,
      description: `订单 ${orderId} 退款扣回积分: ${reason}`,
    }

    this.logger.log(
      `调用 billing-service /deduct: userId=${userId} amount=${amount} orderId=${orderId}`,
    )

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.internalApiKey,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`billing-service deduct 失败: HTTP ${resp.status} ${text}`)
    }
  }

  /**
   * 调用 order-service 发起微信退款
   *
   * 端点: POST {ORDER_SERVICE_URL}/api/v1/orders/:id/refund
   * Headers: x-api-key: ${INTERNAL_API_KEY}
   */
  private async invokeWechatRefund(orderId: string, reason: string): Promise<void> {
    if (!this.internalApiKey) {
      throw new Error('INTERNAL_API_KEY 未配置，无法调用 order-service')
    }

    const url = `${this.orderServiceUrl}/api/v1/orders/${orderId}/refund`
    const body = { reason }

    this.logger.log(`调用 order-service /refund: orderId=${orderId} reason=${reason}`)

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.internalApiKey,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`order-service refund 失败: HTTP ${resp.status} ${text}`)
    }
  }
}
