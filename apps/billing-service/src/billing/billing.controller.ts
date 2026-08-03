/**
 * BillingController — 积分计费 API
 *
 * 路由前缀：api/v1/points（由 main.ts 的全局前缀 + Controller 前缀叠加）
 *
 * 端点分组：
 *  - 外部 API（@CurrentUser 注入 JWT 用户）：balance / transactions
 *  - 内部 API（@Public + @InternalApi，x-api-key 鉴权）：freeze / settle / release / grant / reward
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, InternalApi, Public } from '@reelclone/common'
import { BillingService } from './billing.service'
import { FreezePointsDto } from './dto/freeze-points.dto'
import { GrantPointsDto } from './dto/grant-points.dto'
import { ListTransactionsDto } from './dto/list-transactions.dto'
import { ReleasePointsDto } from './dto/release-points.dto'
import { RewardPointsDto } from './dto/reward-points.dto'
import { SettlePointsDto } from './dto/settle-points.dto'

@ApiTags('billing')
@Controller('points')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // -------------------- 外部 API（需 JWT） --------------------

  /**
   * GET /api/v1/points/balance
   * 当前积分余额（可用 / 冻结 / 累计）
   */
  @Get('balance')
  @ApiOperation({ summary: '查询当前积分余额（可用/冻结/累计）' })
  async getBalance(@CurrentUser('userId') userId: string) {
    return this.billing.getBalance(userId)
  }

  /**
   * GET /api/v1/points/transactions
   * 积分流水（分页 + 筛选）
   */
  @Get('transactions')
  @ApiOperation({ summary: '查询积分流水列表（分页 + 筛选）' })
  async listTransactions(@CurrentUser('userId') userId: string, @Query() dto: ListTransactionsDto) {
    return this.billing.listTransactions(userId, dto)
  }

  /**
   * GET /api/v1/points/transactions/:id
   * 单笔流水详情
   */
  @Get('transactions/:id')
  @ApiOperation({ summary: '查询单笔积分流水详情' })
  async getTransaction(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.billing.getTransaction(userId, id)
  }

  // -------------------- 内部 API（API Key 鉴权） --------------------

  /**
   * POST /api/v1/points/freeze
   * 冻结积分（任务提交时由 workbench-service 调用）
   */
  @Public()
  @InternalApi()
  @Post('freeze')
  @ApiOperation({ summary: '冻结积分（内部 API）' })
  async freeze(@Body() dto: FreezePointsDto) {
    return this.billing.freeze(dto)
  }

  /**
   * POST /api/v1/points/settle
   * 结算冻结积分（任务成功后调用）
   */
  @Public()
  @InternalApi()
  @Post('settle')
  @ApiOperation({ summary: '结算冻结积分（内部 API）' })
  async settle(@Body() dto: SettlePointsDto) {
    return this.billing.settle(dto)
  }

  /**
   * POST /api/v1/points/release
   * 释放冻结积分（任务失败/取消时调用）
   */
  @Public()
  @InternalApi()
  @Post('release')
  @ApiOperation({ summary: '释放冻结积分（内部 API）' })
  async release(@Body() dto: ReleasePointsDto) {
    return this.billing.release(dto)
  }

  /**
   * POST /api/v1/points/grant
   * 赠送积分（套餐购买支付成功后由 order-service 调用）
   */
  @Public()
  @InternalApi()
  @Post('grant')
  @ApiOperation({ summary: '赠送积分（内部 API）' })
  async grant(@Body() dto: GrantPointsDto) {
    return this.billing.grant(dto)
  }

  /**
   * POST /api/v1/points/reward
   * 奖励积分（模板被使用时奖励上传者，由 template-service 调用）
   */
  @Public()
  @InternalApi()
  @Post('reward')
  @ApiOperation({ summary: '奖励积分（内部 API）' })
  async reward(@Body() dto: RewardPointsDto) {
    return this.billing.reward(dto)
  }

  /**
   * GET /api/v1/points/internal/templates/:templateId/reward-count
   * 统计某模板已发放的 REWARD 流水数（内部接口，供对账任务调用）
   */
  @Public()
  @InternalApi()
  @Get('internal/templates/:templateId/reward-count')
  @ApiOperation({ summary: '统计模板已发放奖励数（内部 API）' })
  async getRewardCount(@Param('templateId') templateId: string) {
    const count = await this.billing.countRewardsByTemplateId(templateId)
    return { templateId, rewardCount: count }
  }

  /**
   * GET /api/v1/points/internal/templates/:templateId/reward-ordinals
   * 查询某模板已实际发放的奖励序号列表（P1-10 间隙补偿）
   *
   * 从 main 库 CreditOperation 提取序号，而非 billing 库 PointTransaction 投影。
   * 返回已存在的序号集合，对账服务据此枚举缺口补发，避免 COUNT(*) 间隙饥饿。
   */
  @Public()
  @InternalApi()
  @Get('internal/templates/:templateId/reward-ordinals')
  @ApiOperation({ summary: '查询模板已发放奖励序号列表（内部 API）' })
  async getRewardOrdinals(@Param('templateId') templateId: string) {
    const ordinals = await this.billing.getRewardOrdinalsByTemplateId(templateId)
    return { templateId, ordinals }
  }
}
