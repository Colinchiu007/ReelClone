/**
 * Activity 容器装配单元测试
 *
 * 验证 buildActivities() 将 8 组 Activity（共 32 个函数）正确聚合为单一对象。
 * 通过 mock @reelclone/temporal 提供 Activity 组，专注验证容器的装配逻辑。
 */
import { buildActivities, ACTIVITY_NAMES } from './activities.container'

// Mock @reelclone/temporal：提供 8 组 Activity 的桩实现
// 避免加载真实 libs/temporal（其 Activity 在模块顶层调用 Context.current()，须在 Worker 上下文内执行）
jest.mock('@reelclone/temporal', () => {
  const fn = () => jest.fn()
  return {
    seedanceActivities: {
      submitToSeedance: fn(),
      querySeedanceTask: fn(),
      cancelSeedanceTask: fn(),
    },
    billingActivities: {
      freezeCredits: fn(),
      settleCredits: fn(),
      releaseCredits: fn(),
    },
    mediaActivities: {
      downloadVideo: fn(),
      postProcessVideo: fn(),
      generateThumbnail: fn(),
      moderateContent: fn(),
    },
    analyzerActivities: {
      downloadBenchmarkVideo: fn(),
      analyzeVideo: fn(),
      summarizeReport: fn(),
    },
    notificationActivities: {
      updateWorkStatus: fn(),
      updateBenchmarkStatus: fn(),
      notifyUser: fn(),
      sendSubscribeMessage: fn(),
    },
    ossActivities: {
      uploadToOSS: fn(),
      generateSignedUrl: fn(),
    },
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
    reconcilerActivities: {
      scanPendingExecutions: fn(),
      claimExecution: fn(),
      queryProviderTaskStatus: fn(),
      updateExecutionStage: fn(),
      releaseClaim: fn(),
    },
  }
})

/** 断言给定值是函数（避免跨 realm 的 instanceof Function 误判） */
function expectFunction(value: unknown): void {
  expect(typeof value).toBe('function')
}

describe('activities.container', () => {
  describe('buildActivities', () => {
    it('返回包含全部 32 个 Activity 的对象', () => {
      const activities = buildActivities()

      expect(activities).toBeDefined()
      expect(typeof activities).toBe('object')
      expect(Object.keys(activities)).toHaveLength(ACTIVITY_NAMES.length)
    })

    it('每个 Activity 名称均存在且为函数', () => {
      const activities = buildActivities()

      for (const name of ACTIVITY_NAMES) {
        expect(activities).toHaveProperty(name)
        expectFunction(activities[name as keyof typeof activities])
      }
    })

    it('包含 seedance 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.submitToSeedance)
      expectFunction(activities.querySeedanceTask)
      expectFunction(activities.cancelSeedanceTask)
    })

    it('包含 billing 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.freezeCredits)
      expectFunction(activities.settleCredits)
      expectFunction(activities.releaseCredits)
    })

    it('包含 media 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.downloadVideo)
      expectFunction(activities.postProcessVideo)
      expectFunction(activities.generateThumbnail)
      expectFunction(activities.moderateContent)
    })

    it('包含 analyzer 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.downloadBenchmarkVideo)
      expectFunction(activities.analyzeVideo)
      expectFunction(activities.summarizeReport)
    })

    it('包含 notification 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.updateWorkStatus)
      expectFunction(activities.updateBenchmarkStatus)
      expectFunction(activities.notifyUser)
      expectFunction(activities.sendSubscribeMessage)
    })

    it('包含 oss 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.uploadToOSS)
      expectFunction(activities.generateSignedUrl)
    })

    it('包含 template 组的全部 Activity', () => {
      const activities = buildActivities()
      expectFunction(activities.downloadAssetVideo)
      expectFunction(activities.extractVideoMeta)
      expectFunction(activities.generateTemplateThumbnail)
      expectFunction(activities.analyzeTemplateVideo)
      expectFunction(activities.summarizeTemplate)
      expectFunction(activities.uploadThumbnail)
      expectFunction(activities.finalizeTemplate)
      expectFunction(activities.markTemplateFailed)
    })

    it('多次调用返回的对象包含相同的 Activity 引用', () => {
      const a = buildActivities()
      const b = buildActivities()
      // 同一组源 Activity，引用应一致
      expect(a.submitToSeedance).toBe(b.submitToSeedance)
      expect(a.uploadToOSS).toBe(b.uploadToOSS)
    })
  })

  describe('ACTIVITY_NAMES', () => {
    it('包含 32 个 Activity 名称', () => {
      expect(ACTIVITY_NAMES).toHaveLength(32)
    })

    it('所有名称均唯一', () => {
      const unique = new Set(ACTIVITY_NAMES)
      expect(unique.size).toBe(ACTIVITY_NAMES.length)
    })
  })
})
