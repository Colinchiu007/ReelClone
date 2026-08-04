/**
 * ProfitSharingService — 分账核心业务服务
 *
 * 职责：
 *  1. 支付成功后自动发起分账（best-effort，不阻塞回调）
 *  2. 处理分账回调通知
 *  3. 重试失败的分账
 *
 * 分账触发点：
 *  - 在 OrderService.handleCallback() 事务提交后，作为第 11 步调用
 *  - 异常不抛出（best-effort），由 admin 手动重试
 *
 * 金额计算：
 *  - 每个接收方金额 = Math.floor(总金额分 * ratio / 10000)
 *  - 平台获得剩余 = 总金额分 - sum(接收方金额)
 *  - 整数截断保证微信侧总金额一致
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Inject } from '@nestjs/common'
import {
  type IWechatPayAdapter,
  type ProfitSharingRequest,
  WECHAT_PAY_ADAPTER,
} from '@reelclone/adapters-wechat'
import {
  DATABASE_CONNECTIONS,
  ProfitSharingReceiver,
  ReceiverStatus,
  ProfitSharingRecord,
  ProfitSharingStatus,
  ProfitSharingItem,
} from '@reelclone/database'

/** 发起分账参数 */
export interface InitiateProfitSharingParams {
  orderId: string
  orderNo: string
  transactionId: string
  /** 订单总金额（元） */
  totalAmountYuan: number
}

/** 分账回调体结构 */
export interface ProfitSharingCallbackBody {
  outOrderNo: string
  state: string
  receivers: Array<{
    type: string
    account: string
    amount: number
    state: string
    failReason?: string
  }>
}

/**
 * 分账核心服务
 */
@Injectable()
export class ProfitSharingService {
  private readonly logger = new Logger(ProfitSharingService.name)

  constructor(
    @InjectRepository(ProfitSharingReceiver, DATABASE_CONNECTIONS.MAIN)
    private readonly receiverRepo: Repository<ProfitSharingReceiver>,
    @InjectRepository(ProfitSharingRecord, DATABASE_CONNECTIONS.MAIN)
    private readonly recordRepo: Repository<ProfitSharingRecord>,
    @InjectRepository(ProfitSharingItem, DATABASE_CONNECTIONS.MAIN)
    private readonly itemRepo: Repository<ProfitSharingItem>,
    @Inject(WECHAT_PAY_ADAPTER) private readonly adapter: IWechatPayAdapter,
  ) {}

  // -------------------- 发起分账 --------------------

  /**
   * 支付成功后自动发起分账（best-effort）
   *
   * 流程：
   *  1. 查询所有 ACTIVE 接收方
   *  2. 计算各接收方分账金额（整数截断）
   *  3. 创建 ProfitSharingRecord + ProfitSharingItem
   *  4. 调用 adapter.initiateProfitSharing
   *  5. 更新状态为 PROCESSING
   *
   * 异常处理：捕获所有错误，更新 record 为 FAILED，不抛出
   */
  async initiateProfitSharing(params: InitiateProfitSharingParams): Promise<void> {
    const { orderId, orderNo, transactionId, totalAmountYuan } = params

    this.logger.log(`开始分账: orderId=${orderId} orderNo=${orderNo} amount=${totalAmountYuan}元`)

    // 1. 查询所有 ACTIVE 接收方
    const receivers = await this.receiverRepo.find({
      where: { status: ReceiverStatus.ACTIVE },
    })

    if (receivers.length === 0) {
      this.logger.log(`无活跃分账接收方，跳过分账: orderId=${orderId}`)
      return
    }

    // 2. 计算金额（元 → 分）
    const totalAmountFen = Math.round(totalAmountYuan * 100)

    // 逐个接收方按比例计算（整数截断）
    const items: Array<{
      receiver: ProfitSharingReceiver
      amount: number
    }> = []

    for (const receiver of receivers) {
      const amount = Math.floor((totalAmountFen * receiver.ratio) / 10000)
      if (amount > 0) {
        items.push({ receiver, amount })
      }
    }

    // 实际分账总金额
    const sharedAmount = items.reduce((sum, item) => sum + item.amount, 0)

    if (sharedAmount === 0) {
      this.logger.log(`所有接收方分账金额为 0，跳过分账: orderId=${orderId}`)
      return
    }

    // 3. 创建 ProfitSharingRecord
    const record = this.recordRepo.create({
      id: crypto.randomUUID(),
      orderId,
      orderNo,
      totalAmount: totalAmountFen,
      sharedAmount,
      status: ProfitSharingStatus.PENDING,
      retryCount: 0,
      maxRetryCount: 3,
    })

    try {
      await this.recordRepo.save(record)
    } catch (err) {
      // 唯一约束冲突（orderId 唯一）：可能并发重复触发，幂等返回
      this.logger.warn(
        `分账记录已存在（幂等返回）: orderId=${orderId} err=${(err as Error).message}`,
      )
      return
    }

    // 4. 创建 ProfitSharingItem 列表
    const itemEntities = items.map(({ receiver, amount }) =>
      this.itemRepo.create({
        id: crypto.randomUUID(),
        recordId: record.id,
        receiverId: receiver.id,
        receiverName: receiver.name,
        ratio: receiver.ratio,
        amount,
        receiverType: receiver.receiverType,
        receiverAccountId: receiver.receiverAccountId,
        status: 'PENDING',
      }),
    )
    await this.itemRepo.save(itemEntities)

    // 5. 调用微信分账 API
    const outOrderNo = `ps_${orderNo}`

    try {
      const request: ProfitSharingRequest = {
        orderNo: outOrderNo,
        transactionId,
        description: `订单 ${orderNo} 分账`,
        receivers: items.map(({ receiver, amount }) => ({
          type: receiver.receiverType,
          account: receiver.receiverAccountId,
          amount,
          description: receiver.name,
        })),
      }

      await this.adapter.initiateProfitSharing(request)

      // 更新状态
      await this.recordRepo.update(record.id, {
        status: ProfitSharingStatus.PROCESSING,
        profitSharingNo: outOrderNo,
        sharedAt: new Date(),
      })

      await this.itemRepo.update(
        { recordId: record.id },
        { status: 'PROCESSING' },
      )

      this.logger.log(
        `分账已发起: orderId=${orderId} outOrderNo=${outOrderNo} sharedAmount=${sharedAmount}分`,
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.logger.error(`分账发起失败: orderId=${orderId} error=${errMsg}`)

      // 更新为 FAILED
      await this.recordRepo.update(record.id, {
        status: ProfitSharingStatus.FAILED,
        failureReason: errMsg,
      })

      await this.itemRepo.update(
        { recordId: record.id },
        { status: 'FAILED', failReason: errMsg },
      )
    }
  }

  // -------------------- 回调处理 --------------------

  /**
   * 处理分账回调通知
   *
   * 微信分账结果回调格式:
   * {
   *   "out_order_no": "ps_RC20260801120000ABCDEF",
   *   "state": "SUCCESS" | "PROCESSING" | "FAILED",
   *   "receivers": [{ "type": "OPENID", "account": "xxx", "amount": 7000, "state": "SUCCESS" }]
   * }
   */
  async handleCallback(body: {
    outOrderNo: string
    state: string
    receivers: Array<{
      type: string
      account: string
      amount: number
      state: string
      failReason?: string
    }>
  }): Promise<void> {
    const { outOrderNo, state, receivers: receiverResults } = body

    // outOrderNo 格式: ps_{orderNo}
    const orderNo = outOrderNo.startsWith('ps_') ? outOrderNo.slice(3) : outOrderNo

    // 查找分账记录
    const record = await this.recordRepo.findOne({ where: { orderNo } })
    if (!record) {
      this.logger.warn(`分账回调找不到记录: outOrderNo=${outOrderNo}`)
      return
    }

    // 幂等：已终态（SUCCESS / EXHAUSTED）直接返回
    if (
      record.status === ProfitSharingStatus.SUCCESS ||
      record.status === ProfitSharingStatus.EXHAUSTED
    ) {
      this.logger.log(`分账记录已终态，回调幂等返回: recordId=${record.id} status=${record.status}`)
      return
    }

    // 更新 record 状态
    let newStatus: ProfitSharingStatus
    if (state === 'SUCCESS') {
      newStatus = ProfitSharingStatus.SUCCESS
    } else if (state === 'FAILED') {
      newStatus = ProfitSharingStatus.FAILED
    } else {
      // PROCESSING 或其他中间状态，保持 PROCESSING
      newStatus = ProfitSharingStatus.PROCESSING
    }

    await this.recordRepo.update(record.id, {
      status: newStatus,
      callbackAt: new Date(),
      failureReason:
        state === 'FAILED' ? `分账失败: ${receiverResults.find((r) => r.state === 'FAILED')?.failReason ?? '未知原因'}` : null,
    })

    // 更新 item 状态
    const items = await this.itemRepo.find({ where: { recordId: record.id } })
    for (const item of items) {
      const result = receiverResults.find(
        (r) => r.type === item.receiverType && r.account === item.receiverAccountId,
      )
      if (result) {
        await this.itemRepo.update(item.id, {
          status: result.state,
          failReason: result.failReason ?? null,
        })
      }
    }

    this.logger.log(
      `分账回调处理完成: recordId=${record.id} newState=${newStatus}`,
    )
  }

  // -------------------- 重试 --------------------

  /**
   * 手动重试失败的分账
   *
   * 校验：status=FAILED 且 retryCount < maxRetryCount
   * 仅重试失败的明细项
   */
  async retryProfitSharing(recordId: string): Promise<{ success: boolean; message: string }> {
    const record = await this.recordRepo.findOne({ where: { id: recordId } })
    if (!record) {
      return { success: false, message: '分账记录不存在' }
    }

    if (record.status !== ProfitSharingStatus.FAILED) {
      return { success: false, message: `当前状态为 ${record.status}，仅 FAILED 状态可重试` }
    }

    if (record.retryCount >= record.maxRetryCount) {
      await this.recordRepo.update(record.id, {
        status: ProfitSharingStatus.EXHAUSTED,
      })
      return {
        success: false,
        message: `已达最大重试次数 ${record.maxRetryCount}`,
      }
    }

    // 查找失败的明细
    const failedItems = await this.itemRepo.find({
      where: { recordId: record.id, status: 'FAILED' },
    })

    if (failedItems.length === 0) {
      // 没有失败的 item，直接标记成功
      await this.recordRepo.update(record.id, {
        status: ProfitSharingStatus.SUCCESS,
      })
      return { success: true, message: '无失败明细，已标记成功' }
    }

    // 重新构建分账请求（只包含失败的 item）
    const outOrderNo = `ps_${record.orderNo}`

    try {
      const request: ProfitSharingRequest = {
        orderNo: outOrderNo,
        transactionId: '',
        description: `订单 ${record.orderNo} 分账重试`,
        receivers: failedItems.map((item) => ({
          type: item.receiverType,
          account: item.receiverAccountId,
          amount: item.amount,
          description: item.receiverName,
        })),
      }

      await this.adapter.initiateProfitSharing(request)

      await this.recordRepo.update(record.id, {
        status: ProfitSharingStatus.PROCESSING,
        retryCount: record.retryCount + 1,
        failureReason: null,
      })

      await this.itemRepo.update(
        { recordId: record.id, status: 'FAILED' },
        { status: 'PROCESSING', failReason: null },
      )

      this.logger.log(
        `分账重试已发起: recordId=${recordId} retryCount=${record.retryCount + 1}`,
      )

      return { success: true, message: `重试已发起（第 ${record.retryCount + 1} 次）` }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await this.recordRepo.update(record.id, {
        retryCount: record.retryCount + 1,
        failureReason: errMsg,
      })

      return { success: false, message: `重试失败: ${errMsg}` }
    }
  }
}
