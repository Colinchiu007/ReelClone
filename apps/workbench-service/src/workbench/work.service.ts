/**
 * WorkService — 作品业务
 *
 * 职责：
 *  1. findAll: 分页查询用户作品列表（默认排除 DELETED），支持按状态/类型筛选
 *  2. findOne: 查询作品详情（校验所有权）
 *  3. delete: 软删除作品（status=DELETED，保留 OSS 文件 30 天后清理）
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BusinessException,
} from '@reelclone/common';
import {
  DATABASE_CONNECTIONS,
  Work,
  WorkStatus,
} from '@reelclone/database';
import { type ListWorksDto } from './dto/list-works.dto';

/** 分页返回 */
export interface PaginatedWorks {
  list: Work[];
  page: number;
  pageSize: number;
  total: number;
}

/** OSS 文件清理延迟（30 天，单位：毫秒） */
const OSS_CLEANUP_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkService {
  private readonly logger = new Logger(WorkService.name);

  constructor(
    @Inject(DATABASE_CONNECTIONS.MAIN)
    private readonly dataSource: DataSource,
  ) {}

  // -------------------- 查询：列表 --------------------

  /**
   * 分页查询用户作品列表
   * 默认排除 DELETED 状态（除非显式筛选 status=DELETED）
   */
  async findAll(userId: string, dto: ListWorksDto): Promise<PaginatedWorks> {
    const workRepo = this.dataSource.getRepository(Work);

    const qb = workRepo
      .createQueryBuilder('work')
      .where('work.userId = :userId', { userId });

    // 状态筛选
    if (dto.status) {
      qb.andWhere('work.status = :status', { status: dto.status });
    } else {
      // 默认排除 DELETED
      qb.andWhere('work.status != :deleted', { deleted: WorkStatus.DELETED });
    }

    // 类型筛选
    if (dto.workType) {
      qb.andWhere('work.type = :workType', { workType: dto.workType });
    }

    qb.orderBy('work.createdAt', 'DESC');

    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    return { list, page, pageSize, total };
  }

  // -------------------- 查询：详情 --------------------

  /**
   * 查询作品详情（校验所有权）
   * 已软删除的作品返回 NOT_FOUND
   */
  async findOne(userId: string, workId: string): Promise<Work> {
    const workRepo = this.dataSource.getRepository(Work);

    const work = await workRepo.findOne({
      where: { id: workId },
      relations: ['generationTasks'],
    });

    if (!work || work.status === WorkStatus.DELETED) {
      throw BusinessException.notFound('作品', { workId });
    }

    if (work.userId !== userId) {
      throw BusinessException.forbidden('无权访问此作品', { workId });
    }

    return work;
  }

  // -------------------- 删除 --------------------

  /**
   * 软删除作品
   *
   * 仅更新 status=DELETED，不删除数据库记录。
   * OSS 文件保留 30 天后由定时任务清理（此处仅记录清理时间戳）。
   */
  async delete(userId: string, workId: string): Promise<void> {
    const work = await this.findOne(userId, workId);

    const workRepo = this.dataSource.getRepository(Work);

    const cleanupAt = new Date(Date.now() + OSS_CLEANUP_DELAY_MS);

    await workRepo.update(work.id, {
      status: WorkStatus.DELETED,
      errorLog: {
        ...(work.errorLog ?? {}),
        deletedAt: new Date().toISOString(),
        ossCleanupAt: cleanupAt.toISOString(),
      },
    });

    this.logger.log(
      `作品已软删除 workId=${workId} userId=${userId} 预计 OSS 清理时间=${cleanupAt.toISOString()}`,
    );
  }
}
