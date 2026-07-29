/**
 * WorkService 单元测试
 *
 * 覆盖：
 *  - findAll：分页 + 筛选 + 默认排除 DELETED
 *  - findOne：成功 / 不存在 / 无权限
 *  - delete：软删除（status=DELETED）
 */
import { BusinessException } from '@reelclone/common';
import { Work, WorkStatus, WorkType } from '@reelclone/database';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { WorkService } from './work.service';
import { ListWorksDto } from './dto/list-works.dto';

// -------------------- Mock 工具 --------------------

/** 模拟 Repository */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((e: unknown) => e),
    update: jest.fn(async () => ({ affected: 1, generatedMaps: [] })),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('WorkService', () => {
  let service: WorkService;
  let dataSource: jest.Mocked<DataSource>;
  let workRepo: jest.Mocked<Repository<Work>>;

  beforeEach(() => {
    workRepo = mockRepo<Work>();
    dataSource = {
      getRepository: jest.fn(() => workRepo),
    } as unknown as jest.Mocked<DataSource>;

    service = new WorkService(dataSource);
  });

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('分页返回作品列表', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'work-1' } as Work],
          1,
        ]),
      };
      workRepo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findAll('user-1', new ListWorksDto());

      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('默认排除 DELETED 状态', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      workRepo.createQueryBuilder.mockReturnValue(qb as never);

      await service.findAll('user-1', new ListWorksDto());

      // 应该排除 DELETED
      expect(qb.andWhere).toHaveBeenCalledWith(
        'work.status != :deleted',
        expect.objectContaining({ deleted: WorkStatus.DELETED }),
      );
    });

    it('支持类型筛选', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      workRepo.createQueryBuilder.mockReturnValue(qb as never);

      const dto = new ListWorksDto();
      dto.workType = WorkType.VIDEO;

      await service.findAll('user-1', dto);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'work.type = :workType',
        expect.objectContaining({ workType: WorkType.VIDEO }),
      );
    });
  });

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('成功返回作品详情', async () => {
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        status: WorkStatus.COMPLETED,
        type: WorkType.VIDEO,
      };
      workRepo.findOne.mockResolvedValue(work as Work);

      const result = await service.findOne('user-1', 'work-1');
      expect(result.id).toBe('work-1');
    });

    it('作品不存在时抛异常', async () => {
      workRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nope')).rejects.toThrow(
        BusinessException,
      );
    });

    it('无权限访问时抛异常', async () => {
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'other-user',
        status: WorkStatus.COMPLETED,
      };
      workRepo.findOne.mockResolvedValue(work as Work);

      await expect(service.findOne('user-1', 'work-1')).rejects.toThrow(
        BusinessException,
      );
    });

    it('已软删除的作品返回 NOT_FOUND', async () => {
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        status: WorkStatus.DELETED,
      };
      workRepo.findOne.mockResolvedValue(work as Work);

      await expect(service.findOne('user-1', 'work-1')).rejects.toThrow(
        BusinessException,
      );
    });
  });

  // -------------------- delete --------------------

  describe('delete', () => {
    it('软删除作品（status=DELETED）', async () => {
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        status: WorkStatus.COMPLETED,
        type: WorkType.VIDEO,
        errorLog: null,
      };
      workRepo.findOne.mockResolvedValue(work as Work);

      await service.delete('user-1', 'work-1');

      // 应更新状态为 DELETED
      expect(workRepo.update).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({ status: WorkStatus.DELETED }),
      );
    });
  });
});
