/**
 * ProfitSharingReceiverService — 分账接收方管理
 *
 * 职责：
 *  1. CRUD 分账接收方
 *  2. ratio 总和校验（所有 ACTIVE 接收方 ratio 之和 <= 10000）
 *  3. 软删除（status=INACTIVE）
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BusinessException, ErrorCode } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  ProfitSharingReceiver,
  ReceiverStatus,
} from '@reelclone/database'
import { CreateReceiverDto } from './dto/create-receiver.dto'
import { UpdateReceiverDto } from './dto/update-receiver.dto'

@Injectable()
export class ProfitSharingReceiverService {
  private readonly logger = new Logger(ProfitSharingReceiverService.name)

  constructor(
    @InjectRepository(ProfitSharingReceiver, DATABASE_CONNECTIONS.MAIN)
    private readonly receiverRepo: Repository<ProfitSharingReceiver>,
  ) {}

  // -------------------- 查询 --------------------

  /** 查询所有接收方 */
  async findAll(): Promise<ProfitSharingReceiver[]> {
    return this.receiverRepo.find({ order: { createdAt: 'ASC' } })
  }

  /** 查询单个接收方 */
  async findOne(id: string): Promise<ProfitSharingReceiver> {
    const receiver = await this.receiverRepo.findOne({ where: { id } })
    if (!receiver) {
      throw BusinessException.notFound('分账接收方', { id })
    }
    return receiver
  }

  // -------------------- 创建 --------------------

  /**
   * 创建分账接收方
   *
   * 校验：所有 ACTIVE 接收方 ratio 之和 + 新 ratio <= 10000
   */
  async create(dto: CreateReceiverDto): Promise<ProfitSharingReceiver> {
    await this.validateRatioSum(dto.ratio)

    const receiver = this.receiverRepo.create({
      ...dto,
      status: ReceiverStatus.ACTIVE,
    })

    const saved = await this.receiverRepo.save(receiver)
    this.logger.log(`分账接收方已创建: id=${saved.id} name=${saved.name} ratio=${saved.ratio}`)
    return saved
  }

  // -------------------- 更新 --------------------

  /**
   * 更新分账接收方
   *
   * 校验：所有 ACTIVE 接收方 ratio 之和 + 增量 <= 10000
   */
  async update(id: string, dto: UpdateReceiverDto): Promise<ProfitSharingReceiver> {
    const receiver = await this.findOne(id)

    // 如果要更新 ratio，需重新校验总和
    if (dto.ratio !== undefined && dto.ratio !== receiver.ratio) {
      const delta = dto.ratio - receiver.ratio
      await this.validateRatioSum(delta)
    }

    Object.assign(receiver, dto)
    const saved = await this.receiverRepo.save(receiver)
    this.logger.log(`分账接收方已更新: id=${saved.id}`)
    return saved
  }

  // -------------------- 删除（软） --------------------

  /**
   * 删除分账接收方（软删除：status=INACTIVE）
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const receiver = await this.findOne(id)
    receiver.status = ReceiverStatus.INACTIVE
    await this.receiverRepo.save(receiver)
    this.logger.log(`分账接收方已删除: id=${id} name=${receiver.name}`)
    return { deleted: true }
  }

  // -------------------- 内部方法 --------------------

  /**
   * 校验 ratio 总和
   *
   * @param deltaRatio 要新增的 ratio（创建时为 dto.ratio，更新时为差值）
   * @throws BusinessException 如果总和超过 10000
   */
  private async validateRatioSum(deltaRatio: number): Promise<void> {
    const activeReceivers = await this.receiverRepo.find({
      where: { status: ReceiverStatus.ACTIVE },
    })

    const currentSum = activeReceivers.reduce((sum, r) => sum + r.ratio, 0)
    const newSum = currentSum + deltaRatio

    if (newSum > 10000) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        `分账比例总和超出限制：当前 ${currentSum}/10000，新增 ${deltaRatio}，合计 ${newSum}/10000`,
        { currentSum, deltaRatio, newSum, max: 10000 },
      )
    }
  }
}
