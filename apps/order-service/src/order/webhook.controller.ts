/**
 * 微信支付回调控制器
 *
 * 前缀: api/v1/webhooks/wechat-pay（api/v1 为全局前缀）
 *
 * 端点（公开，由微信服务器调用）:
 *  - POST /             支付回调
 *
 * 处理逻辑:
 *  1. 解析回调报文（含签名头与 body）
 *  2. 委托 OrderService.handleCallback 处理（校验签名 + 解密 + 幂等更新订单 + 赠积分）
 *  3. 始终返回 200 + { code: 'SUCCESS' }，避免微信重试
 *     （即使订单不存在或已处理，也返回成功）
 */
import { Body, Controller, Headers, Post } from '@nestjs/common';
import { Public } from '@reelclone/common';
import { OrderService } from './order.service';

/** 微信支付回调响应（微信要求格式） */
interface WechatCallbackResponse {
  code: 'SUCCESS' | 'FAIL';
  message: string;
}

@Controller('webhooks/wechat-pay')
export class WebhookController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * 支付回调入口
   *
   * 微信服务器在用户支付成功后调用此接口，
   * 携带签名头（Wechatpay-Serial / Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature）
   * 与加密的 body。
   */
  @Public()
  @Post()
  async handle(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<WechatCallbackResponse> {
    const serial = this.extractHeader(headers, 'wechatpay-serial');
    const timestamp = this.extractHeader(headers, 'wechatpay-timestamp');
    const nonce = this.extractHeader(headers, 'wechatpay-nonce');
    const signature = this.extractHeader(headers, 'wechatpay-signature');

    try {
      await this.orderService.handleCallback({
        serial,
        timestamp,
        nonce,
        signature,
        body,
      });
      return { code: 'SUCCESS', message: 'OK' };
    } catch (err) {
      // 签名校验失败或其他错误：返回 FAIL，微信会重试
      // 但对于订单不存在、已 PAID 等情况，handleCallback 内部不会抛错
      return {
        code: 'FAIL',
        message: (err as Error).message ?? '处理失败',
      };
    }
  }

  /** 大小写不敏感地提取 header 值 */
  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lower) {
        return typeof value === 'string' ? value : value?.[0];
      }
    }
    return undefined;
  }
}
