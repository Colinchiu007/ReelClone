/**
 * Worker 启动逻辑单元测试
 *
 * 测试 bootstrapWorker / shutdownWorker / getWorkerStatus：
 *   1. bootstrapWorker 从 ConfigService 读取 Temporal 连接配置，并用规范队列调用 startWorker
 *   2. getWorkerStatus 正确反映运行状态
 *   3. shutdownWorker 调用 stopWorker 并重置状态
 *   4. 未运行时 shutdownWorker 不会调用 stopWorker
 *
 * 通过 mock @reelclone/temporal 隔离真实 Temporal Worker 依赖。
 */
import { type INestApplication } from '@nestjs/common'

// Mock @reelclone/temporal：桩 startWorker / stopWorker 与 Activity 组
jest.mock('@reelclone/temporal', () => {
  const fn = () => jest.fn()
  return {
    startWorker: jest.fn().mockResolvedValue(undefined),
    stopWorker: jest.fn().mockResolvedValue(undefined),
    setActivityDependencies: jest.fn(),
    getActivityDependencies: jest.fn(),
    TASK_QUEUE: { DEFAULT: 'reelclone-tasks' },
    seedanceActivities: {
      submitToSeedance: fn(),
      querySeedanceTask: fn(),
      cancelSeedanceTask: fn(),
    },
    billingActivities: { freezeCredits: fn(), settleCredits: fn(), releaseCredits: fn() },
    mediaActivities: {
      downloadVideo: fn(),
      postProcessVideo: fn(),
      generateThumbnail: fn(),
      moderateContent: fn(),
    },
    analyzerActivities: { downloadBenchmarkVideo: fn(), analyzeVideo: fn(), summarizeReport: fn() },
    notificationActivities: {
      updateWorkStatus: fn(),
      updateBenchmarkStatus: fn(),
      notifyUser: fn(),
      sendSubscribeMessage: fn(),
    },
    ossActivities: { uploadToOSS: fn(), generateSignedUrl: fn() },
    templateActivities: {
      downloadAssetVideo: fn(),
      extractVideoMeta: fn(),
      generateTemplateThumbnail: fn(),
      analyzeTemplateVideo: fn(),
      summarizeTemplate: fn(),
      uploadThumbnail: fn(),
      finalizeTemplate: fn(),
      markTemplateFailed: fn(),
    },
  }
})

// mock 后再导入，确保使用桩实现
import { startWorker, stopWorker } from '@reelclone/temporal'
import { bootstrapWorker, shutdownWorker, getWorkerStatus } from './worker.bootstrap'

describe('worker.bootstrap', () => {
  let mockConfigService: { get: jest.Mock }
  let mockApp: INestApplication

  beforeEach(async () => {
    jest.clearAllMocks()
    mockConfigService = { get: jest.fn() }
    mockApp = { get: jest.fn(() => mockConfigService) } as unknown as INestApplication
    // 重置 Worker 运行状态
    await shutdownWorker()
  })

  describe('getWorkerStatus', () => {
    it('初始状态为未运行，队列名为默认值', () => {
      const status = getWorkerStatus()
      expect(status.running).toBe(false)
      expect(status.taskQueue).toBe('reelclone-tasks')
    })
  })

  describe('bootstrapWorker', () => {
    it('从 ConfigService 读取配置并以 reelclone-tasks 队列启动 Worker', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_ADDRESS') return 'temporal:7233'
        if (key === 'TEMPORAL_NAMESPACE') return 'prod-ns'
        return undefined
      })

      await bootstrapWorker(mockApp)

      expect(startWorker).toHaveBeenCalledTimes(1)
      expect(startWorker).toHaveBeenCalledWith({
        address: 'temporal:7233',
        namespace: 'prod-ns',
        taskQueue: 'reelclone-tasks',
      })
      expect(getWorkerStatus()).toEqual({ running: true, taskQueue: 'reelclone-tasks' })
    })

    it('始终使用规范队列，且不读取已废弃的队列环境变量', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_ADDRESS') return 'localhost:7233'
        if (key === 'TEMPORAL_NAMESPACE') return 'reelclone'
        if (key === 'MEDIA_WORKER_TASK_QUEUE') return 'custom-queue'
        return undefined
      })

      await bootstrapWorker(mockApp)

      expect(startWorker).toHaveBeenCalledWith(
        expect.objectContaining({ taskQueue: 'reelclone-tasks' }),
      )
      expect(getWorkerStatus().taskQueue).toBe('reelclone-tasks')
      expect(mockConfigService.get).not.toHaveBeenCalledWith('MEDIA_WORKER_TASK_QUEUE')
    })

    it('未配置 address/namespace 时使用默认值', async () => {
      mockConfigService.get.mockReturnValue(undefined)

      await bootstrapWorker(mockApp)

      expect(startWorker).toHaveBeenCalledWith({
        address: 'localhost:7233',
        namespace: 'reelclone',
        taskQueue: 'reelclone-tasks',
      })
    })

    it('启动后 running 状态为 true', async () => {
      mockConfigService.get.mockReturnValue(undefined)
      await bootstrapWorker(mockApp)
      expect(getWorkerStatus().running).toBe(true)
    })
  })

  describe('shutdownWorker', () => {
    it('运行中调用 stopWorker 并将 running 置为 false', async () => {
      mockConfigService.get.mockReturnValue(undefined)
      await bootstrapWorker(mockApp)
      expect(getWorkerStatus().running).toBe(true)

      // 清除 beforeEach 中 shutdown 产生的调用记录，仅统计本次 shutdown
      ;(stopWorker as jest.Mock).mockClear()
      await shutdownWorker()

      expect(stopWorker).toHaveBeenCalledTimes(1)
      expect(getWorkerStatus().running).toBe(false)
    })

    it('未运行时不会调用 stopWorker', async () => {
      // beforeEach 已 shutdown，当前 running=false
      expect(getWorkerStatus().running).toBe(false)
      ;(stopWorker as jest.Mock).mockClear()

      await shutdownWorker()

      expect(stopWorker).not.toHaveBeenCalled()
    })

    it('多次 shutdown 不会重复调用 stopWorker', async () => {
      mockConfigService.get.mockReturnValue(undefined)
      await bootstrapWorker(mockApp)

      await shutdownWorker()
      ;(stopWorker as jest.Mock).mockClear()
      await shutdownWorker()
      await shutdownWorker()

      expect(stopWorker).not.toHaveBeenCalled()
    })

    it('shutdown 后可重新 bootstrap', async () => {
      mockConfigService.get.mockReturnValue(undefined)

      await bootstrapWorker(mockApp)
      expect(getWorkerStatus().running).toBe(true)

      await shutdownWorker()
      expect(getWorkerStatus().running).toBe(false)

      await bootstrapWorker(mockApp)
      expect(getWorkerStatus().running).toBe(true)
      expect(startWorker).toHaveBeenCalledTimes(2)
    })
  })
})
