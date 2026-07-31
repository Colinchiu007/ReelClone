/**
 * 计费 Activity
 *
 * Temporal Worker 通过 billing-service 的内部 API 执行积分操作。账务系统
 * 已提供幂等、余额缓存和账本校验，因此 Activity 只负责传递完整的预留信息。
 */
import { Context } from '@temporalio/activity'
import axios, { type AxiosError } from 'axios'
import { type BillingActivities, type BillingReservation } from '../types'
import { isMockMode, mockDelay } from './mock.util'

/** 已处理幂等键集合（仅 Mock 模式下用于幂等性演示） */
const processedKeys = new Set<string>()

interface BillingApiResponse<T> {
  code: number
  message?: string
  data?: T
}

interface BillingOperationResponse {
  success: boolean
  transactionId: string
}

function billingServiceUrl(): string {
  return (process.env.BILLING_SERVICE_URL || 'http://billing-service:3006').replace(/\/$/, '')
}

function billingApiKey(): string {
  const apiKey = process.env.INTERNAL_API_KEY || ''
  if (!apiKey) {
    throw new Error('[Billing] INTERNAL_API_KEY 未配置，拒绝调用 billing-service')
  }
  return apiKey
}

async function postBilling(
  path: string,
  body: Record<string, unknown>,
): Promise<BillingOperationResponse> {
  try {
    const response = await axios.post<BillingApiResponse<BillingOperationResponse>>(
      `${billingServiceUrl()}${path}`,
      body,
      {
        timeout: 10_000,
        headers: {
          'x-api-key': billingApiKey(),
          'Content-Type': 'application/json',
        },
      },
    )
    const payload = response.data
    if (payload.code !== 0 || !payload.data?.success) {
      throw new Error(payload.message || `billing-service 返回异常 code=${payload.code}`)
    }
    return payload.data
  } catch (err) {
    const axiosError = err as AxiosError<BillingApiResponse<unknown>>
    const message = axiosError.response?.data?.message || (err as Error).message
    throw new Error(`[Billing] billing-service 调用失败: ${message}`)
  }
}

/** 冻结积分（当前视频生成由 workbench-service 在启动工作流前调用）。 */
export async function freezeCredits(
  userId: string,
  amount: number,
  idempotencyKey: string,
  workId?: string,
): Promise<boolean> {
  const ctx = Context.current()
  const dedupKey = `freeze:${userId}:${idempotencyKey}`
  if (processedKeys.has(dedupKey)) {
    ctx.log.warn('[Billing] 重复冻结请求已拦截（幂等）', { userId, idempotencyKey })
    return true
  }

  ctx.log.info('[Billing] 冻结积分', { userId, amount, idempotencyKey, workId })
  if (isMockMode()) {
    await mockDelay(150)
    processedKeys.add(dedupKey)
    return true
  }

  await postBilling('/api/v1/points/freeze', {
    userId,
    amount,
    idempotencyKey,
    workId,
    description: `temporal:freeze:${workId ?? 'unknown'}`,
  })
  return true
}

/** 结算一笔已冻结的积分预留。 */
export async function settleCredits(
  userId: string,
  workId: string,
  reservation: BillingReservation,
): Promise<boolean> {
  const ctx = Context.current()
  const { amount, freezeId, settleIdempotencyKey } = reservation
  const dedupKey = `settle:${workId}:${settleIdempotencyKey}`
  if (processedKeys.has(dedupKey)) {
    ctx.log.warn('[Billing] 重复结算请求已拦截（幂等）', { workId, settleIdempotencyKey })
    return true
  }

  ctx.log.info('[Billing] 结算积分', { userId, workId, amount, freezeId })
  if (isMockMode()) {
    await mockDelay(150)
    processedKeys.add(dedupKey)
    return true
  }

  await postBilling('/api/v1/points/settle', {
    userId,
    amount,
    idempotencyKey: settleIdempotencyKey,
    freezeId,
    workId,
    reservationMode: reservation.billingMode !== 'legacy',
    description: `temporal:settle:${workId}`,
  })
  return true
}

/** 释放一笔已冻结的积分预留。 */
export async function releaseCredits(
  userId: string,
  workId: string,
  reservation: BillingReservation,
): Promise<boolean> {
  const ctx = Context.current()
  const { amount, freezeId, releaseIdempotencyKey } = reservation
  const dedupKey = `release:${workId}:${releaseIdempotencyKey}`
  if (processedKeys.has(dedupKey)) {
    ctx.log.warn('[Billing] 重复释放请求已拦截（幂等）', { workId, releaseIdempotencyKey })
    return true
  }

  ctx.log.info('[Billing] 释放积分', { userId, workId, amount, freezeId })
  if (isMockMode()) {
    await mockDelay(150)
    processedKeys.add(dedupKey)
    return true
  }

  await postBilling('/api/v1/points/release', {
    userId,
    amount,
    idempotencyKey: releaseIdempotencyKey,
    freezeId,
    reservationMode: reservation.billingMode !== 'legacy',
    description: `temporal:release:${workId}`,
  })
  return true
}

/** 计费 Activity 实现集合 */
export const billingActivities: BillingActivities = {
  freezeCredits,
  settleCredits,
  releaseCredits,
}
