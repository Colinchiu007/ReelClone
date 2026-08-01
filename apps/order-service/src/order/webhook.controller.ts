/**
 * 微信支付回调控制器
 *
 * 前缀: api/v1/webhooks/wechat-pay（api/v1 为全局前缀）
 *
 * 端点（公开，由微信服务器调用）:
 *  - POST /             支付回调
 *
 * 处理逻辑:
 *  1. 从 req.rawBody 获取原始请求体（验签必须使用未修改的 raw body）
 *  2. 委托 OrderService.handleCallback 处理（验签 + 解密 + 幂等更新订单 + 赠积分）
 *  3. 始终返回 200 + { code: 'SUCCESS' }，避免微信重试
 *     （即使订单不存在或已处理，也返回成功）
 *
 * 注意：
 *  - @SkipResponseInterceptor() 确保响应不被全局 ResponseInterceptor 包装
 *    （微信要求回调返回 {"code":"SUCCESS","message":"OK"} 原始格式）
 *  - rawBody 由 main.ts 中 NestFactory.create(AppModule, { rawBody: true }) 启用
 */
import { Body, Controller, Headers, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public, SkipResponseInterceptor } from '@reelclone/common'
import { type Request } from 'express'
import { OrderService } from './order.service'

/** 微信支付回调响应（微信要求格式） */
interface WechatCallbackResponse {
  code: 'SUCCESS' | 'FAIL'
  message: string
}

@ApiTags('order-webhook')
@Controller('webhooks/wechat-pay')
export class WebhookController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * 支付回调入口
   *
   * 微信服务器在用户支付成功后调用此接口，
   * 携带签名头（Wechatpay-Serial / Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature）
   * 与加密的 body。
   *
   * 验签使用 req.rawBody（由 NestJS rawBody: true 提供），确保 body 未被 JSON 解析修改。
   */
  @Public()
  @SkipResponseInterceptor()
  @Post()
  @ApiOperation({ summary: '微信支付回调' })
  async handle(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<WechatCallbackResponse> {
    // 优先使用 rawBody（验签用），fallback 到 JSON.stringify(body)
    const rawBody: string =
      (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body)

    try {
      await this.orderService.handleCallback({
        headers,
        rawBody,
      })
      return { code: 'SUCCESS', message: 'OK' }
    } catch (err) {
      // 签名校验失败或其他错误：返回 FAIL，微信会重试
      // 但对于订单不存在、已 PAID 等情况，handleCallback 内部不会抛错
      return {
        code: 'FAIL',
        message: (err as Error).message ?? '处理失败',
      }
    }
  }
}
