/**
 * 分账回调控制器
 *
 * 前缀: api/v1/webhooks/wechat-pay-profit-sharing（api/v1 为全局前缀）
 *
 * 端点（公开，由微信服务器调用）:
 *  - POST /             分账结果回调
 *
 * 处理逻辑:
 *  1. 从 req.rawBody 获取原始请求体（验签必须使用未修改的 raw body）
 *  2. 委托适配器验签 + 解密
 *  3. 委托 ProfitSharingService.handleCallback 处理分账结果
 *  4. 始终返回 200 + { code: 'SUCCESS' }，避免微信重试
 *
 * 注意：
 *  - @SkipResponseInterceptor() 确保响应不被全局 ResponseInterceptor 包装
 *  - rawBody 由 main.ts 中 NestFactory.create(AppModule, { rawBody: true }) 启用
 */
import { Body, Controller, Headers, Inject, Logger, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public, SkipResponseInterceptor } from '@reelclone/common'
import {
  type IWechatPayAdapter,
  WECHAT_PAY_ADAPTER,
} from '@reelclone/adapters-wechat'
import { type Request } from 'express'
import {
  ProfitSharingService,
  type ProfitSharingCallbackBody,
} from './profit-sharing.service'

/** 微信支付回调响应（微信要求格式） */
interface WechatCallbackResponse {
  code: 'SUCCESS' | 'FAIL'
  message: string
}

@ApiTags('profit-sharing-webhook')
@Controller('webhooks/wechat-pay-profit-sharing')
export class ProfitSharingWebhookController {
  private readonly logger = new Logger(ProfitSharingWebhookController.name)

  constructor(
    private readonly profitSharingService: ProfitSharingService,
    @Inject(WECHAT_PAY_ADAPTER) private readonly adapter: IWechatPayAdapter,
  ) {}

  /**
   * 分账结果回调入口
   *
   * 微信服务器在分账处理完成后调用此接口，
   * 携带签名头与加密的 body。
   *
   * 验签使用 req.rawBody（由 NestJS rawBody: true 提供），确保 body 未被 JSON 解析修改。
   */
  @Public()
  @SkipResponseInterceptor()
  @Post()
  @ApiOperation({ summary: '微信分账结果回调' })
  async handle(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<WechatCallbackResponse> {
    // 优先使用 rawBody（验签用），fallback 到 JSON.stringify(body)
    const rawBody: string =
      (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body)

    try {
      // 1. 验签
      const notification = await this.adapter.verifyNotification(headers, rawBody)
      if (!notification.verified) {
        this.logger.warn('分账回调签名校验失败')
        return { code: 'FAIL', message: '签名校验失败' }
      }

      // 2. 解密
      const resource = notification.body?.resource
      if (!resource?.ciphertext || !resource?.nonce) {
        this.logger.warn('分账回调验签通过但 resource 缺失')
        return { code: 'SUCCESS', message: 'OK' }
      }

      const plaintext = this.adapter.decryptResource(
        resource.ciphertext,
        resource.associated_data ?? '',
        resource.nonce,
      )

      const decrypted = JSON.parse(plaintext) as ProfitSharingCallbackBody

      // 3. 委托服务处理
      await this.profitSharingService.handleCallback(decrypted)

      return { code: 'SUCCESS', message: 'OK' }
    } catch (err) {
      this.logger.error(`分账回调处理异常: ${(err as Error).message}`)
      // 签名校验失败返回 FAIL，其他异常始终返回 SUCCESS 避免微信无限重试
      return { code: 'SUCCESS', message: 'OK' }
    }
  }
}
