/**
 * Capability Registry 类型定义
 *
 * 统一管理生成类型的 Provider 路由、积分定价、参数校验和 UI 配置。
 * 是 Quote/Pricing、Validation、UI Mapping、Provider Switching 的单一真相源。
 */

import type { GenerationType } from './generation-type';

// ============================================================
// 积分定价
// ============================================================

/** 固定积分（文本生成、图片生成、3D 建模等） */
export interface FixedPoints {
  mode: 'fixed';
  points: number;
}

/** 矩阵积分（视频类，按分辨率 × 时长） */
export interface MatrixPoints {
  mode: 'matrix';
  /** 5 秒基准积分，按分辨率 */
  base: Record<string, number>;
  /** 时长倍率 */
  multiplier: Record<number, number>;
  /** 默认分辨率 */
  defaultResolution: string;
  /** 默认时长（秒） */
  defaultDuration: number;
}

export type PointsConfig = FixedPoints | MatrixPoints;

// ============================================================
// UI 配置
// ============================================================

export interface ModelOption {
  value: string;
  label: string;
  /** Provider 层实际模型名（与前端 value 不同时需要映射） */
  providerModel?: string;
}

export interface UIConfig {
  /** 显示名称 */
  label: string;
  /** 描述 */
  description?: string;
  /** 分类标签（用于前端分组） */
  category: 'video' | 'text' | 'image';
  /** 可选分辨率 */
  resolutions?: string[];
  /** 可选时长（秒） */
  durations?: number[];
  /** 可选宽高比 */
  aspectRatios?: string[];
  /** 可选模型 */
  models?: ModelOption[];
  /** 提示词最大长度 */
  maxPromptLength: number;
  /** 需要参考图 */
  hasReferenceImages?: boolean;
  /** 需要参考视频 */
  hasReferenceVideo?: boolean;
  /** 需要参考音频 */
  hasReferenceAudio?: boolean;
  /** 需要首帧图 */
  hasFirstFrame?: boolean;
  /** 需要尾帧图 */
  hasLastFrame?: boolean;
  /** 参考图最大数量 */
  maxReferenceImages?: number;
  /** 各字段默认值 */
  defaults: Record<string, unknown>;
}

// ============================================================
// 参数校验
// ============================================================

export interface ParamRule {
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: readonly (string | number)[];
}

export interface ValidationConfig {
  /** 该类型必需的参数名列表 */
  requiredParams: readonly string[];
  /** 各参数的详细校验规则 */
  paramRules: Record<string, ParamRule>;
}

// ============================================================
// Provider 路由
// ============================================================

/** 生成类型对应的 Temporal WorkType 名称 */
export type TemporalWorkTypeName =
  | 'text_to_video'
  | 'image_to_video'
  | 'image_to_video_with_tail'
  | 'edit_video'
  | 'extend_video'
  | 'reference_to_video';

/** 生成类型对应的 WorkType 名称 */
export type WorkTypeName = 'TEXT' | 'IMAGE' | 'VIDEO';

// ============================================================
// 单个能力配置
// ============================================================

export interface CapabilityConfig {
  /** 生成类型 */
  type: GenerationType;
  /** 处理该类型的 Provider 名称 */
  provider: string;
  /** Temporal 工作流类型 */
  temporalWorkType: TemporalWorkTypeName;
  /** Work 类型 */
  workType: WorkTypeName;
  /** 是否在 real mode 下支持 */
  realReady: boolean;
  /** 积分定价 */
  points: PointsConfig;
  /** UI 配置 */
  ui: UIConfig;
  /** 参数校验 */
  validation: ValidationConfig;
}
