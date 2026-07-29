/**
 * NotificationService 单元测试
 *
 * 测试覆盖：
 *  - listNotifications: 分页 + type/isRead 筛选
 *  - markAsRead: 成功 / 通知不存在 / 无权操作
 *  - markAllAsRead: 批量更新
 *  - getUnreadCount: 计数
 *  - createAndPush: 写库 + 推送
 */
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ErrorCode } from '@reelclone/common'
import { Notification, NotificationType } from '@reelclone/database'
import { NotificationGateway } from './ws.gateway'
import {
  type CreateNotificationInput,
  NotificationService,
} from './notification.service'
import { ListNotificationsDto } from './dto/list-notifications.dto'

// -------------------- Mock 工具 --------------------

/**
 * 构造一个 TypeORM QueryBuilder 风格的 mock。
 *
 * 返回的 mock 同时具备：
 *  - 链式方法（where/orderBy/skip/take/andWhere），都返回自身
 *  - 终端方法 getManyAndCount（jest.Mock，可在测试中 mockResolvedValueOnce）
 *
 * 由于 SelectQueryBuilder 接口庞大，我们用 MockQueryBuilder 自定义类型保留 jest.Mock 元数据，
 * 然后通过 as unknown as 让 Repository.createQueryBuilder 接受它。
 */
interface MockQueryBuilder<T> {
  where: jest.Mock<MockQueryBuilder<T>, unknown[]>
  andWhere: jest.Mock<MockQueryBuilder<T>, unknown[]>
  orderBy: jest.Mock<MockQueryBuilder<T>, unknown[]>
  skip: jest.Mock<MockQueryBuilder<T>, unknown[]>
  take: jest.Mock<MockQueryBuilder<T>, unknown[]>
  getManyAndCount: jest.Mock<Promise<[T[], number]>, unknown[]>
}

function createQueryBuilderMock<T>(): MockQueryBuilder<T> {
  const chain = {} as MockQueryBuilder<T>
  ;(['where', 'andWhere', 'orderBy', 'skip', 'take'] as const).forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.getManyAndCount = jest.fn().mockResolvedValue([[], 0] as [T[], number])
  return chain
}

describe('NotificationService', () => {
  let service: NotificationService
  let repo: jest.Mocked<Repository<Notification>>
  let gateway: jest.Mocked<NotificationGateway>

  beforeEach(async () => {
    // Repository mock
    const repoMock = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock<Notification>()),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn((entity: Partial<Notification>) => entity as Notification),
    }

    // Gateway mock
    const gatewayMock = {
      pushToUser: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification, 'main'), useValue: repoMock },
        { provide: NotificationGateway, useValue: gatewayMock },
      ],
    }).compile()

    service = module.get(NotificationService)
    repo = module.get(getRepositoryToken(Notification, 'main')) as unknown as jest.Mocked<
      Repository<Notification>
    >
    gateway = module.get(NotificationGateway) as unknown as jest.Mocked<NotificationGateway>
  })

  // -------------------- listNotifications --------------------

  describe('listNotifications', () => {
    it('默认参数：第 1 页，每页 20 条', async () => {
      const expected = [
        {
          id: 'n1',
          userId: 'u1',
          type: NotificationType.SYSTEM,
          title: 'test',
          content: null,
          data: null,
          isRead: false,
          readAt: null,
          createdAt: new Date(),
        } as unknown as Notification,
      ]
      const qb = createQueryBuilderMock<Notification>()
      qb.getManyAndCount.mockResolvedValueOnce([expected, 1])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const query = new ListNotificationsDto()
      const result = await service.listNotifications('u1', query)

      expect(qb.where).toHaveBeenCalledWith('n.user_id = :userId', { userId: 'u1' })
      expect(qb.orderBy).toHaveBeenCalledWith('n.created_at', 'DESC')
      expect(qb.skip).toHaveBeenCalledWith(0)
      expect(qb.take).toHaveBeenCalledWith(20)
      expect(qb.andWhere).not.toHaveBeenCalled()
      expect(result.code).toBe(ErrorCode.SUCCESS)
      expect(result.data.list).toHaveLength(1)
      expect(result.data.total).toBe(1)
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
    })

    it('分页：第 2 页，每页 10 条 → skip=10', async () => {
      const qb = createQueryBuilderMock<Notification>()
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const query = new ListNotificationsDto()
      query.page = 2
      query.pageSize = 10
      await service.listNotifications('u1', query)

      expect(qb.skip).toHaveBeenCalledWith(10)
      expect(qb.take).toHaveBeenCalledWith(10)
    })

    it('按 type 筛选：添加 andWhere type 条件', async () => {
      const qb = createQueryBuilderMock<Notification>()
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const query = new ListNotificationsDto()
      query.type = NotificationType.SYSTEM
      await service.listNotifications('u1', query)

      expect(qb.andWhere).toHaveBeenCalledWith('n.type = :type', {
        type: NotificationType.SYSTEM,
      })
    })

    it('按 isRead=false 筛选', async () => {
      const qb = createQueryBuilderMock<Notification>()
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const query = new ListNotificationsDto()
      query.isRead = false
      await service.listNotifications('u1', query)

      expect(qb.andWhere).toHaveBeenCalledWith('n.is_read = :isRead', {
        isRead: false,
      })
    })

    it('type + isRead 同时筛选：调用两次 andWhere', async () => {
      const qb = createQueryBuilderMock<Notification>()
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      repo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const query = new ListNotificationsDto()
      query.type = NotificationType.TASK_COMPLETED
      query.isRead = true
      await service.listNotifications('u1', query)

      expect(qb.andWhere).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------- getUnreadCount --------------------

  describe('getUnreadCount', () => {
    it('调用 count({ userId, isRead: false })', async () => {
      repo.count.mockResolvedValueOnce(5)
      const result = await service.getUnreadCount('u1')
      expect(repo.count).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
      })
      expect(result).toBe(5)
    })
  })

  // -------------------- markAsRead --------------------

  describe('markAsRead', () => {
    it('成功：通知存在且属于当前用户，且未读 → 更新 isRead/readAt', async () => {
      const notification = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.SYSTEM,
        title: 't',
        isRead: false,
        readAt: null,
      } as Notification
      repo.findOne.mockResolvedValueOnce(notification)
      repo.save.mockResolvedValueOnce({ ...notification, isRead: true })

      const result = await service.markAsRead('u1', 'n1')

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'n1' } })
      expect(notification.isRead).toBe(true)
      expect(notification.readAt).toBeInstanceOf(Date)
      expect(repo.save).toHaveBeenCalledWith(notification)
      expect(result.isRead).toBe(true)
    })

    it('幂等：通知已经是已读状态 → 不再 save', async () => {
      const notification = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.SYSTEM,
        title: 't',
        isRead: true,
        readAt: new Date('2024-01-01'),
      } as Notification
      repo.findOne.mockResolvedValueOnce(notification)

      await service.markAsRead('u1', 'n1')

      expect(repo.save).not.toHaveBeenCalled()
    })

    it('通知不存在 → 抛 NOT_FOUND BusinessException', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(service.markAsRead('u1', 'missing')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      })
    })

    it('无权操作：通知属于其他用户 → 抛 FORBIDDEN BusinessException', async () => {
      const notification = {
        id: 'n1',
        userId: 'other-user',
        type: NotificationType.SYSTEM,
        title: 't',
      } as unknown as Notification
      repo.findOne.mockResolvedValue(notification)

      await expect(service.markAsRead('u1', 'n1')).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
      })
    })
  })

  // -------------------- markAllAsRead --------------------

  describe('markAllAsRead', () => {
    it('调用 update({ userId, isRead: false }, { isRead: true, readAt: now })', async () => {
      repo.update.mockResolvedValueOnce({ affected: 7, raw: [] } as never)

      const result = await service.markAllAsRead('u1')

      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'u1', isRead: false },
        expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      )
      expect(result).toBe(7)
    })

    it('没有未读 → affected=0', async () => {
      repo.update.mockResolvedValueOnce({ affected: 0, raw: [] } as never)
      const result = await service.markAllAsRead('u1')
      expect(result).toBe(0)
    })
  })

  // -------------------- createAndPush --------------------

  describe('createAndPush', () => {
    it('写库 + 调用 gateway.pushToUser', async () => {
      const input: CreateNotificationInput = {
        userId: 'u1',
        type: NotificationType.TASK_COMPLETED,
        title: '任务完成',
        content: 'hello',
        data: { workId: 'w1' },
      }
      const savedEntity = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.TASK_COMPLETED,
        title: '任务完成',
        content: 'hello',
        data: { workId: 'w1' },
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      } as unknown as Notification

      repo.create.mockReturnValueOnce(savedEntity)
      repo.save.mockResolvedValueOnce(savedEntity)

      const result = await service.createAndPush(input, 'task:completed', {
        workId: 'w1',
      })

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: NotificationType.TASK_COMPLETED,
          title: '任务完成',
          content: 'hello',
          data: { workId: 'w1' },
          isRead: false,
        }),
      )
      expect(repo.save).toHaveBeenCalledWith(savedEntity)
      expect(gateway.pushToUser).toHaveBeenCalledWith(
        'u1',
        'task:completed',
        expect.objectContaining({
          notification: savedEntity,
          workId: 'w1',
        }),
      )
      expect(result).toBe(savedEntity)
    })

    it('默认事件名为 notification', async () => {
      const savedEntity = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.SYSTEM,
        title: 't',
      } as unknown as Notification
      repo.create.mockReturnValueOnce(savedEntity)
      repo.save.mockResolvedValueOnce(savedEntity)

      await service.createAndPush({
        userId: 'u1',
        type: NotificationType.SYSTEM,
        title: 't',
      })

      expect(gateway.pushToUser).toHaveBeenCalledWith(
        'u1',
        'notification',
        expect.objectContaining({ notification: savedEntity }),
      )
    })

    it('推送失败不抛出，仅记录日志', async () => {
      const savedEntity = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.SYSTEM,
        title: 't',
      } as unknown as Notification
      repo.create.mockReturnValueOnce(savedEntity)
      repo.save.mockResolvedValueOnce(savedEntity)
      gateway.pushToUser.mockImplementationOnce(() => {
        throw new Error('socket server not ready')
      })

      // 不应抛出
      await expect(
        service.createAndPush({
          userId: 'u1',
          type: NotificationType.SYSTEM,
          title: 't',
        }),
      ).resolves.toBeDefined()
    })
  })
})
