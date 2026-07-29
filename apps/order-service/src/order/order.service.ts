/**
 * OrderService — 订单业务编排
 *
 * 职责：
 *  1. 创建订单：校验套餐 → 生成订单号 → 落库 PENDING → 调起微信支付 → 返回支付参数
 *  2. 查询订单：列表分页 / 详情（校验所有权）
 *  3. 取消订单：仅 PENDING 状态可取消
 *  4. 处理支付回调：校验签名 → 解密 → 幂等更新订单状态 → 创建 UserPackage → 调用 billing grant
 *
 * 幂等机制：
 *  - 创建订单：基于 idempotencyKey 在 Redis 缓存结果（24h）
 *  - 支付回调：基于 transactionId 唯一性保证（已 PAID 订单不再处理）
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import {
  BusinessException,
  ErrorCode,
  generateIdempotencyKey,
} from '@reelclone/common';
import {
  DATABASE_CONNECTIONS,
  Order,
  OrderStatus,
  Package,
  PackageStatus,
  PaymentMethod,
  REDIS_CLIENT,
  User,
  UserPackage,
  UserPackageStatus,
} from '@reelclone/database';
import { BillingClient } from './billing.client';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { WechatPayService } from './wechat-pay.service';
import { v4 as uuidv4 } from 'uuid';

/** 创建订单响应 */
export interface CreateOrderResult {
  orderId: string;
  orderNo: string;
  paymentParams: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: 'RSA';
    paySign: string;
  };
}

/** 订单列表分页结果 */
export interface PaginatedOrders {
  list: Order[];
  page: number;
  pageSize: number;
  total: number;
}

/** 支付回调处理结果 */
export interface HandleCallbackResult {
  processed: boolean;
  orderId: string;
  orderNo: string;
}

/** 幂等结果缓存 TTL（秒） */
const IDEMPOTENCY_RESULT_TTL = 86400;

/** 失败赠送积分重试队列 TTL（秒，7 天） */
const GRANT_RETRY_TTL = 604800;

/** 缓存键：创建订单幂等结果 */
const createOrderIdemKey = (key: string) => `order:create:idem:${key}`;

/** 缓存键：订单赠送积分失败重试（值含调用参数） */
const grantRetryKey = (orderId: string) => `order:grant:retry:${orderId}`;

/**
 * 订单服务
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order, DATABASE_CONNECTIONS.MAIN)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Package, DATABASE_CONNECTIONS.MAIN)
    private readonly packageRepo: Repository<Package>,
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
    @Inject(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly wechatPay: WechatPayService,
    private readonly billingClient: BillingClient,
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
      generateIdempotencyKey(userId, 'create_order', { packageId: dto.packageId });

    // 1. 幂等检查
    const cached = await this.redis.get(createOrderIdemKey(idempotencyKey));
    if (cached) {
      this.logger.log(`创建订单幂等命中: ${idempotencyKey}`);
      return JSON.parse(cached) as CreateOrderResult;
    }

    // 2. 校验套餐
    const pkg = await this.packageRepo.findOne({ where: { id: dto.packageId } });
    if (!pkg) {
      throw BusinessException.notFound('套餐', { packageId: dto.packageId });
    }
    if (pkg.status !== PackageStatus.ACTIVE) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        '套餐已下架，无法购买',
        { packageId: dto.packageId, status: pkg.status },
      );
    }

    // 3. 获取用户 openid（用于微信支付）
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw BusinessException.notFound('用户', { userId });
    }

    // 4. 生成订单号
    const orderNo = this.generateOrderNo();

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
    });
    await this.orderRepo.save(order);

    // 6. 调起微信支付
    let paymentParams;
    try {
      paymentParams = await this.wechatPay.createPaymentParams({
        orderNo,
        amount: Number(pkg.price),
        description: pkg.name,
        openid: user.openId,
      });
    } catch (err) {
      // 支付调起失败：将订单标记为取消（避免遗留 PENDING）
      this.logger.error(
        `微信支付调起失败，订单 ${orderNo} 将被取消: ${(err as Error).message}`,
      );
      await this.orderRepo.update(order.id, {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
      });
      throw BusinessException.paymentFailed(
        `微信支付调起失败: ${(err as Error).message}`,
      );
    }

    const result: CreateOrderResult = {
      orderId: order.id,
      orderNo,
      paymentParams,
    };

    // 7. 缓存幂等结果
    await this.redis.set(
      createOrderIdemKey(idempotencyKey),
      JSON.stringify(result),
      'EX',
      IDEMPOTENCY_RESULT_TTL,
    );

    return result;
  }

  // -------------------- 查询：列表 --------------------

  /**
   * 订单列表（分页 + 状态筛选）
   */
  async findAll(userId: string, dto: ListOrdersDto): Promise<PaginatedOrders> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.userId = :userId', { userId });

    if (dto.status) {
      qb.andWhere('o.status = :status', { status: dto.status });
    }

    qb.orderBy('o.createdAt', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, page, pageSize, total };
  }

  // -------------------- 查询：详情 --------------------

  /**
   * 订单详情（校验所有权）
   */
  async findOne(userId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw BusinessException.notFound('订单', { orderId });
    }
    if (order.userId !== userId) {
      // 出于安全考虑，无权访问时也返回 NOT_FOUND（不暴露存在性）
      throw BusinessException.notFound('订单', { orderId });
    }
    return order;
  }

  /**
   * 通过订单号查询订单（供 webhook 使用）
   */
  async findByOrderNo(orderNo: string): Promise<Order | null> {
    return this.orderRepo.findOne({ where: { orderNo } });
  }

  // -------------------- 取消订单 --------------------

  /**
   * 取消订单（仅 PENDING 状态可取消）
   */
  async cancel(userId: string, orderId: string): Promise<Order> {
    const order = await this.findOne(userId, orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        `订单当前状态为 ${order.status}，无法取消`,
        { orderId, status: order.status },
      );
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    await this.orderRepo.save(order);

    return order;
  }

  // -------------------- 支付回调处理 --------------------

  /**
   * 处理微信支付回调
   *
   * 流程：
   *  1. 校验签名
   *  2. 解密 resource
   *  3. 通过 out_trade_no 查找订单
   *  4. 幂等检查：订单已 PAID 直接返回成功
   *  5. 事务化：
   *     a. 更新订单 status=PAID, transactionId, paidAt
   *     b. 创建 UserPackage（startedAt=now, expiredAt=now+duration）
   *  6. 事务提交后调用 billing-service /grant 赠送积分
   *     - 失败不回滚事务（订单已支付，必须落库）
   *     - 失败写入 Redis 重试队列（TTL 7 天）供补偿任务捞取
   *     - grant 自身幂等（idempotencyKey=order:{orderId}:grant），重试安全
   *
   * @param payload 回调报文
   * @returns 处理结果
   */
  async handleCallback(payload: {
    serial?: string;
    timestamp?: string;
    nonce?: string;
    signature?: string;
    body: unknown;
  }): Promise<HandleCallbackResult> {
    // 1. 校验签名
    const verified = await this.wechatPay.verifyCallback(
      payload as Parameters<typeof this.wechatPay.verifyCallback>[0],
    );
    if (!verified) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '微信支付回调签名校验失败',
        undefined,
      );
    }

    // 2. 解密 resource
    const result = await this.wechatPay.decryptResource(
      payload as Parameters<typeof this.wechatPay.decryptResource>[0],
    );

    if (result.trade_state !== 'SUCCESS') {
      this.logger.warn(
        `收到非 SUCCESS 状态回调: orderNo=${result.out_trade_no} state=${result.trade_state}`,
      );
      // 非 SUCCESS 仍返回处理成功，避免微信重试，但订单状态不更新
      return {
        processed: false,
        orderId: '',
        orderNo: result.out_trade_no,
      };
    }

    // 3. 查找订单
    const order = await this.findByOrderNo(result.out_trade_no);
    if (!order) {
      this.logger.warn(`回调对应订单不存在: ${result.out_trade_no}`);
      // 返回成功避免微信重试（订单不存在无法处理）
      return {
        processed: false,
        orderId: '',
        orderNo: result.out_trade_no,
      };
    }

    // 4. 幂等检查：订单已 PAID 直接返回
    if (order.status === OrderStatus.PAID) {
      this.logger.log(
        `订单 ${order.orderNo} 已 PAID，回调幂等返回（transactionId=${order.transactionId}）`,
      );
      return {
        processed: false,
        orderId: order.id,
        orderNo: order.orderNo,
      };
    }

    // 5. 事务化更新订单 + 创建 UserPackage
    //    注意：billing-service grant 调用放在事务外执行（避免长事务持锁 + 网络抖动回滚）
    const grantContext = await this.mainDataSource.transaction(
      async (manager) => {
        // 双重检查：在事务内再次确认状态（防止并发回调）
        const fresh = await manager.findOne(Order, { where: { id: order.id } });
        if (!fresh || fresh.status === OrderStatus.PAID) {
          return null;
        }

        const now = new Date();
        const paidAt = result.success_time ? new Date(result.success_time) : now;

        // 5a. 更新订单
        fresh.status = OrderStatus.PAID;
        fresh.transactionId = result.transaction_id;
        fresh.paidAt = paidAt;
        await manager.save(fresh);

        // 5b. 查找套餐（获取 points / bonusPoints / duration）
        const pkg = await manager.findOne(Package, {
          where: { id: fresh.packageId },
        });
        if (!pkg) {
          this.logger.error(
            `订单 ${fresh.orderNo} 对应套餐 ${fresh.packageId} 不存在，跳过 UserPackage 创建`,
          );
          return null;
        }

        // 5c. 创建 UserPackage
        const totalPoints = Number(pkg.points) + Number(pkg.bonusPoints);
        const durationDays = Number(pkg.duration) || 30;
        const expiredAt = new Date(now);
        expiredAt.setDate(expiredAt.getDate() + durationDays);

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
        });
        await manager.save(userPackage);

        // 返回事务外执行 grant 所需的上下文
        return {
          orderId: fresh.id,
          orderNo: fresh.orderNo,
          userId: fresh.userId,
          packageId: pkg.id,
          totalPoints,
        };
      },
    );

    // 6. 事务提交后调用 billing-service 赠送积分
    //    失败不阻塞回调（避免微信重试），但写入 Redis 重试队列供补偿任务捞取
    if (grantContext) {
      await this.invokeGrantWithCompensation(grantContext);
    }

    return {
      processed: true,
      orderId: order.id,
      orderNo: order.orderNo,
    };
  }

  /**
   * 调用 billing-service 赠送积分，失败时记录到 Redis 重试队列
   *
   * 设计权衡：
   *  - 订单已支付成功，回调必须返回成功避免微信重试
   *  - 积分赠送通过 billing-service 的幂等键保证可重试
   *  - 失败记录写入 Redis（TTL 7 天），由补偿任务定期捞取重试
   */
  private async invokeGrantWithCompensation(ctx: {
    orderId: string;
    orderNo: string;
    userId: string;
    packageId: string;
    totalPoints: number;
  }): Promise<void> {
    const grantParams = {
      userId: ctx.userId,
      amount: ctx.totalPoints,
      idempotencyKey: `order:${ctx.orderId}:grant`,
      orderId: ctx.orderId,
      packageId: ctx.packageId,
    };

    try {
      await this.billingClient.grant(grantParams);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `订单 ${ctx.orderNo} 调用 billing grant 失败，已写入重试队列: ${errMsg}`,
      );
      // 写入 Redis 重试队列：补偿任务可通过 SCAN order:grant:retry:* 捞取
      await this.redis.set(
        grantRetryKey(ctx.orderId),
        JSON.stringify({ ...grantParams, error: errMsg, ts: Date.now() }),
        'EX',
        GRANT_RETRY_TTL,
      );
    }
  }

  // -------------------- 工具方法 --------------------

  /**
   * 生成订单号: RC + yyyyMMddHHmmss + 6位随机数字
   */
  private generateOrderNo(): string {
    const now = new Date();
    const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
    const yyyy = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const HH = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const random = Math.floor(100000 + Math.random() * 900000).toString();
    return `RC${yyyy}${MM}${dd}${HH}${mm}${ss}${random}`;
  }
}
