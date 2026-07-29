/**
 * BillingController — 积分计费 API
 *
 * 路由前缀：api/v1/points（由 main.ts 的全局前缀 + Controller 前缀叠加）
 *
 * 端点分组：
 *  - 外部 API（@CurrentUser 注入 JWT 用户）：balance / transactions
 *  - 内部 API（@Public + @InternalApi，x-api-key 鉴权）：freeze / settle / release / grant
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Public } from '@reelclone/common';
import { BillingService } from './billing.service';
import { FreezePointsDto } from './dto/freeze-points.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { ReleasePointsDto } from './dto/release-points.dto';
import { SettlePointsDto } from './dto/settle-points.dto';
import { InternalApi } from './guards/internal-api.decorator';

@Controller('points')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // -------------------- 外部 API（需 JWT） --------------------

  /**
   * GET /api/v1/points/balance
   * 当前积分余额（可用 / 冻结 / 累计）
   */
  @Get('balance')
  async getBalance(@CurrentUser('userId') userId: string) {
    return this.billing.getBalance(userId);
  }

  /**
   * GET /api/v1/points/transactions
   * 积分流水（分页 + 筛选）
   */
  @Get('transactions')
  async listTransactions(
    @CurrentUser('userId') userId: string,
    @Query() dto: ListTransactionsDto,
  ) {
    return this.billing.listTransactions(userId, dto);
  }

  /**
   * GET /api/v1/points/transactions/:id
   * 单笔流水详情
   */
  @Get('transactions/:id')
  async getTransaction(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.billing.getTransaction(userId, id);
  }

  // -------------------- 内部 API（API Key 鉴权） --------------------

  /**
   * POST /api/v1/points/freeze
   * 冻结积分（任务提交时由 workbench-service 调用）
   */
  @Public()
  @InternalApi()
  @Post('freeze')
  async freeze(@Body() dto: FreezePointsDto) {
    return this.billing.freeze(dto);
  }

  /**
   * POST /api/v1/points/settle
   * 结算冻结积分（任务成功后调用）
   */
  @Public()
  @InternalApi()
  @Post('settle')
  async settle(@Body() dto: SettlePointsDto) {
    return this.billing.settle(dto);
  }

  /**
   * POST /api/v1/points/release
   * 释放冻结积分（任务失败/取消时调用）
   */
  @Public()
  @InternalApi()
  @Post('release')
  async release(@Body() dto: ReleasePointsDto) {
    return this.billing.release(dto);
  }

  /**
   * POST /api/v1/points/grant
   * 赠送积分（套餐购买支付成功后由 order-service 调用）
   */
  @Public()
  @InternalApi()
  @Post('grant')
  async grant(@Body() dto: GrantPointsDto) {
    return this.billing.grant(dto);
  }
}
