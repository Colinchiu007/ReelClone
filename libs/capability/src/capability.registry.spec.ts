import { CapabilityRegistry } from './capability.registry';
import { DEFAULT_CAPABILITIES } from './capability.default';
import { GenerationType } from './generation-type';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry(DEFAULT_CAPABILITIES);
  });

  // ============================================================
  // 基础查询
  // ============================================================

  describe('基础查询', () => {
    it('应返回已注册的类型配置', () => {
      const cap = registry.get(GenerationType.TEXT_TO_VIDEO);
      expect(cap).toBeDefined();
      expect(cap!.provider).toBe('SEEDANCE');
      expect(cap!.ui.label).toBe('文生视频');
    });

    it('未注册的类型应返回 undefined', () => {
      expect(registry.get('UNKNOWN_TYPE' as GenerationType)).toBeUndefined();
    });

    it('应返回所有已注册类型', () => {
      expect(registry.getAllTypes()).toHaveLength(DEFAULT_CAPABILITIES.length);
    });

    it('应按分类过滤', () => {
      const videos = registry.getByCategory('video');
      expect(videos.length).toBeGreaterThan(0);
      expect(videos.every((c) => c.ui.category === 'video')).toBe(true);
    });

    it('应返回 real-ready 类型', () => {
      const realReady = registry.getRealReadyTypes();
      expect(realReady).toContain(GenerationType.TEXT_TO_VIDEO);
      expect(realReady).toContain(GenerationType.IMAGE_TO_VIDEO_FIRST);
      expect(realReady).toContain(GenerationType.IMAGE_TO_VIDEO_FIRST_LAST);
      expect(realReady).not.toContain(GenerationType.THREE_D_MODELING);
      expect(realReady).not.toContain(GenerationType.TEXT_GENERATE);
    });
  });

  // ============================================================
  // Provider 路由
  // ============================================================

  describe('Provider 路由', () => {
    it('视频类型应路由到 SEEDANCE', () => {
      expect(registry.getProvider(GenerationType.TEXT_TO_VIDEO)).toBe('SEEDANCE');
      expect(registry.getProvider(GenerationType.IMAGE_TO_VIDEO_FIRST)).toBe('SEEDANCE');
      expect(registry.getProvider(GenerationType.EDIT_VIDEO)).toBe('SEEDANCE');
    });

    it('非视频类型应路由到 MOCK', () => {
      expect(registry.getProvider(GenerationType.TEXT_GENERATE)).toBe('MOCK');
      expect(registry.getProvider(GenerationType.IMAGE_GENERATE)).toBe('MOCK');
    });

    it('应返回正确的 Temporal WorkType', () => {
      expect(registry.getTemporalWorkType(GenerationType.TEXT_TO_VIDEO)).toBe('text_to_video');
      expect(registry.getTemporalWorkType(GenerationType.IMAGE_TO_VIDEO_FIRST)).toBe('image_to_video');
      expect(registry.getTemporalWorkType(GenerationType.THREE_D_MODELING)).toBe('reference_to_video');
    });

    it('应返回正确的 WorkType', () => {
      expect(registry.getWorkType(GenerationType.TEXT_GENERATE)).toBe('TEXT');
      expect(registry.getWorkType(GenerationType.IMAGE_GENERATE)).toBe('IMAGE');
      expect(registry.getWorkType(GenerationType.TEXT_TO_VIDEO)).toBe('VIDEO');
    });

    it('应按 Provider 反查类型', () => {
      const seedanceTypes = registry.getTypesByProvider('SEEDANCE');
      expect(seedanceTypes).toContain(GenerationType.TEXT_TO_VIDEO);
      expect(seedanceTypes).not.toContain(GenerationType.TEXT_GENERATE);
    });
  });

  // ============================================================
  // 积分定价
  // ============================================================

  describe('积分定价', () => {
    it('视频类型应按矩阵计算积分', () => {
      // 720p 5s = 900
      expect(registry.calculatePoints(GenerationType.TEXT_TO_VIDEO, { resolution: '720p', duration: 5 })).toBe(900);
      // 1080p 10s = 1800 * 2 = 3600
      expect(registry.calculatePoints(GenerationType.TEXT_TO_VIDEO, { resolution: '1080p', duration: 10 })).toBe(3600);
      // 480p 5s = 450
      expect(registry.calculatePoints(GenerationType.TEXT_TO_VIDEO, { resolution: '480p', duration: 5 })).toBe(450);
    });

    it('视频类型无参数时应使用默认值', () => {
      // 默认 720p 5s = 900
      expect(registry.calculatePoints(GenerationType.TEXT_TO_VIDEO)).toBe(900);
    });

    it('固定积分类型应返回固定值', () => {
      expect(registry.calculatePoints(GenerationType.TEXT_GENERATE)).toBe(5);
      expect(registry.calculatePoints(GenerationType.IMAGE_GENERATE)).toBe(60);
      expect(registry.calculatePoints(GenerationType.THREE_D_MODELING)).toBe(1800);
      expect(registry.calculatePoints(GenerationType.EDIT_VIDEO)).toBe(1500);
      expect(registry.calculatePoints(GenerationType.EXTEND_VIDEO)).toBe(1200);
    });

    it('所有视频类型应共享相同的积分矩阵', () => {
      const types = [
        GenerationType.TEXT_TO_VIDEO,
        GenerationType.IMAGE_TO_VIDEO_FIRST,
        GenerationType.IMAGE_TO_VIDEO_FIRST_LAST,
      ];
      for (const type of types) {
        expect(registry.calculatePoints(type, { resolution: '720p', duration: 5 })).toBe(900);
        expect(registry.calculatePoints(type, { resolution: '1080p', duration: 10 })).toBe(3600);
      }
    });

    it('应生成前端积分表', () => {
      const table = registry.getPointsTable(GenerationType.TEXT_TO_VIDEO);
      expect(table).toEqual({
        '480p_5': 450,
        '480p_10': 900,
        '720p_5': 900,
        '720p_10': 1800,
        '1080p_5': 1800,
        '1080p_10': 3600,
      });
    });

    it('固定积分类型应返回空积分表', () => {
      expect(registry.getPointsTable(GenerationType.TEXT_GENERATE)).toEqual({});
    });

    it('应返回固定积分', () => {
      expect(registry.getFixedPoints(GenerationType.TEXT_GENERATE)).toBe(5);
      expect(registry.getFixedPoints(GenerationType.TEXT_TO_VIDEO)).toBeUndefined();
    });
  });

  // ============================================================
  // 参数校验
  // ============================================================

  describe('参数校验', () => {
    it('缺少必需参数应返回 invalid', () => {
      const result = registry.validateParams(GenerationType.TEXT_TO_VIDEO, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少必需参数: prompt');
    });

    it('有效参数应通过校验', () => {
      const result = registry.validateParams(GenerationType.TEXT_TO_VIDEO, {
        prompt: '测试提示词',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('超出枚举范围的参数应返回 invalid', () => {
      const result = registry.validateParams(GenerationType.TEXT_TO_VIDEO, {
        prompt: '测试',
        resolution: '4k',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('4k'))).toBe(true);
    });

    it('有效枚举值应通过校验', () => {
      const result = registry.validateParams(GenerationType.TEXT_TO_VIDEO, {
        prompt: '测试',
        resolution: '720p',
        duration: 5,
        aspectRatio: '9:16',
      });
      expect(result.valid).toBe(true);
    });

    it('图生视频首帧类型需要 firstFrame', () => {
      const result = registry.validateParams(GenerationType.IMAGE_TO_VIDEO_FIRST, {
        prompt: '测试',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少必需参数: firstFrame');
    });

    it('图生视频首尾帧类型需要 firstFrame 和 lastFrame', () => {
      const result = registry.validateParams(GenerationType.IMAGE_TO_VIDEO_FIRST_LAST, {
        prompt: '测试',
        firstFrame: 'key',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少必需参数: lastFrame');
    });
  });

  // ============================================================
  // UI 配置
  // ============================================================

  describe('UI 配置', () => {
    it('应返回正确的 UI 配置', () => {
      const ui = registry.getUIConfig(GenerationType.TEXT_TO_VIDEO);
      expect(ui).toBeDefined();
      expect(ui!.label).toBe('文生视频');
      expect(ui!.category).toBe('video');
      expect(ui!.resolutions).toEqual(['480p', '720p', '1080p']);
      expect(ui!.durations).toEqual([5, 10]);
      expect(ui!.aspectRatios).toEqual(['9:16', '16:9', '1:1']);
      expect(ui!.models).toHaveLength(2);
    });

    it('应返回正确的默认值', () => {
      const defaults = registry.getDefaults(GenerationType.TEXT_TO_VIDEO);
      expect(defaults).toEqual({
        resolution: '720p',
        duration: 5,
        aspectRatio: '9:16',
        model: 'seedance2-pro',
      });
    });

    it('应返回最大提示词长度', () => {
      expect(registry.getMaxPromptLength(GenerationType.TEXT_TO_VIDEO)).toBe(2000);
      expect(registry.getMaxPromptLength(GenerationType.IMAGE_GENERATE)).toBe(3000);
    });

    it('应返回模型列表', () => {
      const models = registry.getModels(GenerationType.TEXT_TO_VIDEO);
      expect(models).toHaveLength(2);
      expect(models[0].value).toBe('seedance2-pro');
    });

    it('无模型的类型应返回空列表', () => {
      expect(registry.getModels(GenerationType.TEXT_GENERATE)).toEqual([]);
    });
  });

  // ============================================================
  // 类型辅助
  // ============================================================

  describe('类型辅助', () => {
    it('视频类型判断应正确', () => {
      expect(registry.isVideoType(GenerationType.TEXT_TO_VIDEO)).toBe(true);
      expect(registry.isVideoType(GenerationType.THREE_D_MODELING)).toBe(true);
      expect(registry.isVideoType(GenerationType.EDIT_VIDEO)).toBe(true);
      expect(registry.isVideoType(GenerationType.EXTEND_VIDEO)).toBe(true);
      expect(registry.isVideoType(GenerationType.TEXT_GENERATE)).toBe(false);
      expect(registry.isVideoType(GenerationType.IMAGE_GENERATE)).toBe(false);
    });

    it('real-ready 判断应正确', () => {
      expect(registry.isRealReady(GenerationType.TEXT_TO_VIDEO)).toBe(true);
      expect(registry.isRealReady(GenerationType.TEXT_GENERATE)).toBe(false);
    });

    it('类型注册判断应正确', () => {
      expect(registry.isRegistered(GenerationType.TEXT_TO_VIDEO)).toBe(true);
      expect(registry.isRegistered('UNKNOWN' as GenerationType)).toBe(false);
    });
  });
});
