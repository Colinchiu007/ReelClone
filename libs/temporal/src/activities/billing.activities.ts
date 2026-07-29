/**
 * 计费 Activity
 *
 * 调用 Formance Ledger 进行积分的冻结 / 结算 / 释放，
 * 所有操作通过幂等键保证 Exactly-Once 语义。
 *
 * 幂等键贯穿整个工作流：从 workbench-service 创建任务时生成的
 * `idempotencyKey` 会传入 Temporal，并在每次计费操作中复用。
 */
import { Context } from '@temporalio/activity'
import { type BillingActivities } from '../types'
import { isMockMode, mockDelay } from './mock.util'

/** 已处理幂等键集合（Mock 模式下用于幂等性演示） */
const processedKeys = new Set<string>()

/**
 * 冻结积分（提交任务时调用）
 * 从 available 账户转入 reserved 账户
 */
export async function freezeCredits(
  userId: string,
  amount: number,
  idempotencyKey: string,
): Promise<boolean> {
  const ctx = Context.current()
  // 幂等检查：同一 idempotencyKey 不重复处理
  const dedupKey = `freeze:${userId}:${idempotencyKey}`
  if (processedKeys.has(dedupKey)) {
    ctx.log.warn('[Billing] 重复冻结请求已拦截（幂等）', { userId, idempotencyKey })
    return true
  }

  ctx.log.info('[Billing] 冻结积分', { userId, amount, idempotencyKey })

  if (isMockMode()) {
    // TODO: 替换为真实 Formance Ledger 调用
    //   import { ledgerClient } from '@reelclone/database'
    //   await ledgerClient.post({
    //     ledger: 'reelclone',
    //     script: `credits @world ${amount} @users:${userId} reserved`,
    //     reference: idempotencyKey,
    //   })
    await mockDelay(150)
    processedKeys.add(dedupKey)
    return true
  }

  throw new Error('[Billing] 真实模式尚未接入 Formance Ledger')
}

/**
 * 结算积分（任务成功后调用）
 * 从 reserved 账户转入 spent 账户，按实际用量结算
 */
export async function settleCredits(
  userId: string,
  workId: string,
  actualCost: number,
  idempotencyKey: string,
): Promise<boolean> {
  const ctx = Context.current()
  const dedupKey = `settle:${workId}:${idempotencyKey}`
  if (processedKeys.has(dedupKey)) {
    ctx.log.warn('[Billing] 重复结算请求已拦截（幂等）', { workId, idempotencyKey })
    return true
  }

  ctx.log.info('[Billing] 结算积分', { userId, workId, actualCost, idempotencyKey })

  if (isMockMode()) {
    // TODO: 替换为真实结算
    //   await ledgerClient.post({
    //     ledger: 'reelclone',
    //     script: `reserved @users:${userId} ${actualCost} spent`,
    //     reference: idempotencyKey,
    //   })
    //   // 若预估 > 实际，差额退回 available
    //   const refund = estimatedCredits - actualCost
    //   if (refund > 0) {
    //     await ledgerClient.post({
    //       script: `reserved @users:${userId} ${refund} available`,
    //       reference: `${idempotencyKey}-refund`,
    //     })
    //   }
    await mockDelay(150)
    processedKeys.add(dedupKey)
    return true
  }

  throw new Error('[Billing] 真实模式尚未接入 Formance Ledger')
}

/**
 * 释放积分（任务失败/取消时调用）
 * 从 reserved 账户原路退回 available 账户
 */
export async function releaseCredits(
  userId: string,
  workId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const ctx = Context.current()
  const dedupKey = `release:${workId}:${idempotencyKey}`
  if (processedKeys.has(dedupKey)) {
    ctx.log.warn('[Billing] 重复释放请求已拦截（幂等）', { workId, idempotencyKey })
    return true
  }

  ctx.log.info('[Billing] 释放积分', { userId, workId, idempotencyKey })

  if (isMockMode()) {
    // TODO: 替换为真实释放
    //   await ledgerClient.post({
    //     ledger: 'reelclone',
    //     script: `reserved @users:${userId} all available`,
    //     reference: idempotencyKey,
    //   })
    await mockDelay(150)
    processedKeys.add(dedupKey)
    return true
  }

  throw new Error('[Billing] 真实模式尚未接入 Formance Ledger')
}

/** 计费 Activity 实现集合 */
export const billingActivities: BillingActivities = {
  freezeCredits,
  settleCredits,
  releaseCredits,
}
