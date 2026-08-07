/**
 * IndustryService — 用户行业偏好读写服务
 *
 * 行业偏好存储在 main 库 user.industryPreferences 字段（jsonb string[]）。
 */
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BusinessException } from '@reelclone/common'

@Injectable()
export class IndustryService {
  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 获取指定用户的行业偏好
   * @returns { industries: string[] }
   */
  async getPreferences(userId: string): Promise<{ industries: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) {
      throw BusinessException.notFound('用户')
    }
    return { industries: user.industryPreferences ?? [] }
  }

  /**
   * 设置指定用户的行业偏好（覆盖更新）
   * @returns { industries: string[] } 更新后的行业偏好
   */
  async setPreferences(
    userId: string,
    industries: string[],
  ): Promise<{ industries: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) {
      throw BusinessException.notFound('用户')
    }

    user.industryPreferences = industries
    await this.userRepo.save(user)

    return { industries: user.industryPreferences }
  }
}
