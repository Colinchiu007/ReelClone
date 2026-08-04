/**
 * 分账业务模块 — barrel exports
 *
 * 统一导出分账相关的服务、控制器、DTO，供 app.module 及其他模块按需引入。
 */
export { ProfitSharingModule } from './profit-sharing.module'
export { ProfitSharingService } from './profit-sharing.service'
export { ProfitSharingReceiverService } from './profit-sharing-receiver.service'
export type { InitiateProfitSharingParams, ProfitSharingCallbackBody } from './profit-sharing.service'
export { ProfitSharingWebhookController } from './profit-sharing.controller'
export { ProfitSharingReceiverController } from './profit-sharing-receiver.controller'
export { ProfitSharingRecordController } from './profit-sharing-record.controller'
export { CreateReceiverDto } from './dto/create-receiver.dto'
export { UpdateReceiverDto } from './dto/update-receiver.dto'
export { ListRecordsDto } from './dto/list-records.dto'
export {
  ProfitSharingRecordResponseDto,
  ProfitSharingItemResponseDto,
} from './dto/profit-sharing-record-response.dto'
