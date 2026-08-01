import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CreditReservationService } from './credit-reservation.service'

/** 重放 main -> billing 的 V2 账务 outbox。 */
@Injectable()
export class BillingProjectionCron {
  private readonly logger = new Logger(BillingProjectionCron.name)

  constructor(private readonly reservations: CreditReservationService) {}

  @Cron('*/15 * * * * *')
  async projectPending(): Promise<void> {
    try {
      await this.reservations.projectPending()
    } catch (err) {
      this.logger.error(`账务投影调度失败: ${(err as Error).message}`, (err as Error).stack)
    }
  }
}
