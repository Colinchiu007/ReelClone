/**
 * Capability Registry — 生成能力单一真相源
 *
 * 统一管理 5 个维度：
 *  1. Provider 路由（哪个 Provider 处理哪种类型）
 *  2. 积分定价（固定 / 矩阵）
 *  3. 参数校验规则
 *  4. UI 配置（前端渲染选项）
 *  5. Provider 切换能力
 */
import { GenerationType } from './generation-type';
import type {
  CapabilityConfig,
  PointsConfig,
  UIConfig,
  ValidationConfig,
} from './capability.types';

export class CapabilityRegistry {
  private readonly capabilities: Map<GenerationType, CapabilityConfig>;

  constructor(configs: CapabilityConfig[]) {
    this.capabilities = new Map();
    for (const config of configs) {
      this.capabilities.set(config.type, config);
    }
  }

  // ============================================================
  // 基础查询
  // ============================================================

  /** 获取指定类型的完整配置 */
  get(type: GenerationType): CapabilityConfig | undefined {
    return this.capabilities.get(type);
  }

  /** 获取所有已注册的类型 */
  getAllTypes(): GenerationType[] {
    return Array.from(this.capabilities.keys());
  }

  /** 获取所有已注册的配置 */
  getAll(): CapabilityConfig[] {
    return Array.from(this.capabilities.values());
  }

  /** 按分类过滤（video / text / image） */
  getByCategory(category: 'video' | 'text' | 'image'): CapabilityConfig[] {
    return this.getAll().filter((c) => c.ui.category === category);
  }

  /** 获取所有 real-ready 的类型 */
  getRealReadyTypes(): GenerationType[] {
    return this.getAll()
      .filter((c) => c.realReady)
      .map((c) => c.type);
  }

  // ============================================================
  // 1. Provider 路由
  // ============================================================

  /** 获取指定类型的 Provider 名称 */
  getProvider(type: GenerationType): string {
    return this.capabilities.get(type)?.provider ?? 'MOCK';
  }

  /** 获取指定类型的 Temporal WorkType */
  getTemporalWorkType(type: GenerationType): string {
    return this.capabilities.get(type)?.temporalWorkType ?? 'text_to_video';
  }

  /** 获取指定类型的 WorkType */
  getWorkType(type: GenerationType): string {
    return this.capabilities.get(type)?.workType ?? 'VIDEO';
  }

  /** 获取指定 Provider 处理的所有类型 */
  getTypesByProvider(provider: string): GenerationType[] {
    return this.getAll()
      .filter((c) => c.provider === provider)
      .map((c) => c.type);
  }

  // ============================================================
  // 2. 积分定价
  // ============================================================

  /** 计算指定类型的积分消耗 */
  calculatePoints(
    type: GenerationType,
    options?: { resolution?: string; duration?: number },
  ): number {
    const cap = this.capabilities.get(type);
    if (!cap) return 0;
    return this.computePoints(cap.points, options);
  }

  /** 获取积分配置（供前端渲染积分表） */
  getPointsConfig(type: GenerationType): PointsConfig | undefined {
    return this.capabilities.get(type)?.points;
  }

  /** 生成前端积分表（resolution_duration → points） */
  getPointsTable(type: GenerationType): Record<string, number> {
    const cap = this.capabilities.get(type);
    if (!cap || cap.points.mode !== 'matrix') {
      return {};
    }
    const table: Record<string, number> = {};
    const pts = cap.points;
    for (const [res, base] of Object.entries(pts.base)) {
      for (const [dur, mult] of Object.entries(pts.multiplier)) {
        table[`${res}_${dur}`] = base * mult;
      }
    }
    return table;
  }

  /** 获取固定积分（非视频类型） */
  getFixedPoints(type: GenerationType): number | undefined {
    const cap = this.capabilities.get(type);
    if (!cap || cap.points.mode !== 'fixed') return undefined;
    return cap.points.points;
  }

  private computePoints(
    config: PointsConfig,
    options?: { resolution?: string; duration?: number },
  ): number {
    if (config.mode === 'fixed') {
      return config.points;
    }
    const resolution = options?.resolution ?? config.defaultResolution;
    const duration = options?.duration ?? config.defaultDuration;
    const base = config.base[resolution] ?? config.base[config.defaultResolution];
    const mult = config.multiplier[duration] ?? 1;
    return base * mult;
  }

  // ============================================================
  // 3. 参数校验
  // ============================================================

  /** 获取指定类型的校验配置 */
  getValidation(type: GenerationType): ValidationConfig | undefined {
    return this.capabilities.get(type)?.validation;
  }

  /** 校验参数是否符合该类型的要求 */
  validateParams(
    type: GenerationType,
    params: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    const validation = this.capabilities.get(type)?.validation;
    if (!validation) {
      return { valid: false, errors: [`未知生成类型: ${type}`] };
    }

    const errors: string[] = [];

    // 检查必需参数
    for (const required of validation.requiredParams) {
      if (params[required] === undefined || params[required] === null || params[required] === '') {
        errors.push(`缺少必需参数: ${required}`);
      }
    }

    // 检查参数规则
    for (const [key, rule] of Object.entries(validation.paramRules)) {
      const value = params[key];
      if (value === undefined || value === null) {
        if (rule.required) {
          errors.push(`参数 ${key} 不能为空`);
        }
        continue;
      }

      if (rule.enum && !rule.enum.includes(value as never)) {
        errors.push(`参数 ${key} 值 ${String(value)} 不在允许范围 [${rule.enum.join(', ')}] 内`);
      }

      if (rule.type === 'string' && typeof value === 'string') {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push(`参数 ${key} 长度不能少于 ${rule.minLength}`);
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          errors.push(`参数 ${key} 长度不能超过 ${rule.maxLength}`);
        }
      }

      if (rule.type === 'number' && typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`参数 ${key} 不能小于 ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`参数 ${key} 不能大于 ${rule.max}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ============================================================
  // 4. UI 配置
  // ============================================================

  /** 获取指定类型的 UI 配置 */
  getUIConfig(type: GenerationType): UIConfig | undefined {
    return this.capabilities.get(type)?.ui;
  }

  /** 获取指定类型的默认值 */
  getDefaults(type: GenerationType): Record<string, unknown> {
    return this.capabilities.get(type)?.ui.defaults ?? {};
  }

  /** 获取指定类型的最大提示词长度 */
  getMaxPromptLength(type: GenerationType): number {
    return this.capabilities.get(type)?.ui.maxPromptLength ?? 2000;
  }

  /** 获取指定类型的可用模型列表 */
  getModels(type: GenerationType): { value: string; label: string; providerModel?: string }[] {
    return this.capabilities.get(type)?.ui.models ?? [];
  }

  /** 根据前端模型值获取 Provider 层实际模型名 */
  resolveProviderModel(type: GenerationType, frontendModel: string): string | undefined {
    const models = this.getModels(type);
    const found = models.find((m) => m.value === frontendModel);
    return found?.providerModel ?? found?.value;
  }

  // ============================================================
  // 5. 类型辅助
  // ============================================================

  /** 判断是否为视频类型（含 3D、编辑、延长） */
  isVideoType(type: GenerationType): boolean {
    return this.capabilities.get(type)?.ui.category === 'video';
  }

  /** 判断是否在 real mode 下支持 */
  isRealReady(type: GenerationType): boolean {
    return this.capabilities.get(type)?.realReady ?? false;
  }

  /** 判断类型是否已注册 */
  isRegistered(type: GenerationType): boolean {
    return this.capabilities.has(type);
  }
}
