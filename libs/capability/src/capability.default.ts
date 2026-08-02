/**
 * 默认能力配置（种子数据）
 *
 * 从 points-calculator.util.ts、shared.ts、create-generation.dto.ts
 * 和前端各页面的硬编码值统一迁移到此。
 */
import { GenerationType } from './generation-type'
import type { CapabilityConfig } from './capability.types'

export const DEFAULT_CAPABILITIES: CapabilityConfig[] = [
  // ----------------------------------------------------------
  // 文生视频
  // ----------------------------------------------------------
  {
    type: GenerationType.TEXT_TO_VIDEO,
    provider: 'SEEDANCE',
    temporalWorkType: 'text_to_video',
    workType: 'VIDEO',
    realReady: true,
    points: {
      mode: 'matrix',
      base: { '480p': 450, '720p': 900, '1080p': 1800 },
      multiplier: { 5: 1, 10: 2 },
      defaultResolution: '720p',
      defaultDuration: 5,
    },
    ui: {
      label: '文生视频',
      description: '根据文字描述生成视频',
      category: 'video',
      resolutions: ['480p', '720p', '1080p'],
      durations: [5, 10],
      aspectRatios: ['9:16', '16:9', '1:1'],
      models: [
        { value: 'seedance2-pro', label: 'seedance2 Pro' },
        { value: 'seedance2-lite', label: 'seedance2 Lite' },
      ],
      maxPromptLength: 2000,
      defaults: { resolution: '720p', duration: 5, aspectRatio: '9:16', model: 'seedance2-pro' },
    },
    validation: {
      requiredParams: ['prompt'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
        resolution: { type: 'string', required: false, enum: ['480p', '720p', '1080p'] },
        duration: { type: 'number', required: false, enum: [5, 10] },
        aspectRatio: { type: 'string', required: false, enum: ['9:16', '16:9', '1:1'] },
        model: { type: 'string', required: false },
      },
    },
  },

  // ----------------------------------------------------------
  // 图生视频（首帧）
  // ----------------------------------------------------------
  {
    type: GenerationType.IMAGE_TO_VIDEO_FIRST,
    provider: 'SEEDANCE',
    temporalWorkType: 'image_to_video',
    workType: 'VIDEO',
    realReady: true,
    points: {
      mode: 'matrix',
      base: { '480p': 450, '720p': 900, '1080p': 1800 },
      multiplier: { 5: 1, 10: 2 },
      defaultResolution: '720p',
      defaultDuration: 5,
    },
    ui: {
      label: '图生视频（首帧）',
      description: '根据首帧图片生成视频',
      category: 'video',
      resolutions: ['480p', '720p', '1080p'],
      durations: [5, 10],
      aspectRatios: ['9:16', '16:9', '1:1'],
      models: [
        { value: 'seedance2-pro', label: 'seedance2 Pro' },
        { value: 'seedance2-lite', label: 'seedance2 Lite' },
      ],
      maxPromptLength: 2000,
      hasFirstFrame: true,
      defaults: { resolution: '720p', duration: 5, aspectRatio: '9:16', model: 'seedance2-pro' },
    },
    validation: {
      requiredParams: ['prompt', 'firstFrame'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
        firstFrame: { type: 'string', required: true },
        resolution: { type: 'string', required: false, enum: ['480p', '720p', '1080p'] },
        duration: { type: 'number', required: false, enum: [5, 10] },
        aspectRatio: { type: 'string', required: false, enum: ['9:16', '16:9', '1:1'] },
        model: { type: 'string', required: false },
      },
    },
  },

  // ----------------------------------------------------------
  // 图生视频（首尾帧）
  // ----------------------------------------------------------
  {
    type: GenerationType.IMAGE_TO_VIDEO_FIRST_LAST,
    provider: 'SEEDANCE',
    temporalWorkType: 'image_to_video_with_tail',
    workType: 'VIDEO',
    realReady: true,
    points: {
      mode: 'matrix',
      base: { '480p': 450, '720p': 900, '1080p': 1800 },
      multiplier: { 5: 1, 10: 2 },
      defaultResolution: '720p',
      defaultDuration: 5,
    },
    ui: {
      label: '图生视频（首尾帧）',
      description: '根据首帧和尾帧图片生成视频',
      category: 'video',
      resolutions: ['480p', '720p', '1080p'],
      durations: [5, 10],
      aspectRatios: ['9:16', '16:9', '1:1'],
      models: [
        { value: 'seedance2-pro', label: 'seedance2 Pro' },
        { value: 'seedance2-lite', label: 'seedance2 Lite' },
      ],
      maxPromptLength: 2000,
      hasFirstFrame: true,
      hasLastFrame: true,
      defaults: { resolution: '720p', duration: 5, aspectRatio: '9:16', model: 'seedance2-pro' },
    },
    validation: {
      requiredParams: ['prompt', 'firstFrame', 'lastFrame'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
        firstFrame: { type: 'string', required: true },
        lastFrame: { type: 'string', required: true },
        resolution: { type: 'string', required: false, enum: ['480p', '720p', '1080p'] },
        duration: { type: 'number', required: false, enum: [5, 10] },
        aspectRatio: { type: 'string', required: false, enum: ['9:16', '16:9', '1:1'] },
        model: { type: 'string', required: false },
      },
    },
  },

  // ----------------------------------------------------------
  // 3D 建模
  // ----------------------------------------------------------
  {
    type: GenerationType.THREE_D_MODELING,
    provider: 'SEEDANCE',
    temporalWorkType: 'reference_to_video',
    workType: 'VIDEO',
    realReady: false,
    points: { mode: 'fixed', points: 1800 },
    ui: {
      label: '3D 建模',
      description: '根据参考图生成 3D 效果视频',
      category: 'video',
      maxPromptLength: 2000,
      hasReferenceImages: true,
      maxReferenceImages: 14,
      defaults: {},
    },
    validation: {
      requiredParams: ['prompt'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
        referenceImages: { type: 'string', required: false },
      },
    },
  },

  // ----------------------------------------------------------
  // 编辑视频
  // ----------------------------------------------------------
  {
    type: GenerationType.EDIT_VIDEO,
    provider: 'SEEDANCE',
    temporalWorkType: 'edit_video',
    workType: 'VIDEO',
    realReady: false,
    points: { mode: 'fixed', points: 1500 },
    ui: {
      label: '编辑视频',
      description: '对已有视频进行 AI 编辑',
      category: 'video',
      maxPromptLength: 2000,
      hasReferenceVideo: true,
      hasReferenceImages: true,
      maxReferenceImages: 14,
      defaults: {},
    },
    validation: {
      requiredParams: ['prompt', 'referenceVideo'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
        referenceVideo: { type: 'string', required: true },
        referenceImages: { type: 'string', required: false },
      },
    },
  },

  // ----------------------------------------------------------
  // 延长视频
  // ----------------------------------------------------------
  {
    type: GenerationType.EXTEND_VIDEO,
    provider: 'SEEDANCE',
    temporalWorkType: 'extend_video',
    workType: 'VIDEO',
    realReady: false,
    points: { mode: 'fixed', points: 1200 },
    ui: {
      label: '延长视频',
      description: '延长已有视频的时长',
      category: 'video',
      maxPromptLength: 2000,
      hasReferenceVideo: true,
      durations: [5, 10],
      defaults: { duration: 5 },
    },
    validation: {
      requiredParams: ['prompt', 'referenceVideo'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
        referenceVideo: { type: 'string', required: true },
        duration: { type: 'number', required: false, enum: [5, 10] },
      },
    },
  },

  // ----------------------------------------------------------
  // 文本生成
  // ----------------------------------------------------------
  {
    type: GenerationType.TEXT_GENERATE,
    provider: 'MOCK',
    // MOCK Provider — temporalWorkType 仅为兼容映射，实际不启动 Temporal 工作流
    temporalWorkType: 'text_to_video',
    workType: 'TEXT',
    realReady: false,
    points: { mode: 'fixed', points: 5 },
    ui: {
      label: '文本生成',
      description: 'AI 文案生成',
      category: 'text',
      maxPromptLength: 2000,
      defaults: {},
    },
    validation: {
      requiredParams: ['prompt'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
      },
    },
  },

  // ----------------------------------------------------------
  // 图片生成
  // ----------------------------------------------------------
  {
    type: GenerationType.IMAGE_GENERATE,
    provider: 'MOCK',
    // MOCK Provider — temporalWorkType 仅为兼容映射，实际不启动 Temporal 工作流
    temporalWorkType: 'image_to_video',
    workType: 'IMAGE',
    realReady: false,
    points: { mode: 'fixed', points: 60 },
    ui: {
      label: '图片生成',
      description: 'AI 图片生成',
      category: 'image',
      maxPromptLength: 3000,
      hasReferenceImages: true,
      maxReferenceImages: 14,
      defaults: {},
    },
    validation: {
      requiredParams: ['prompt'],
      paramRules: {
        prompt: { type: 'string', required: true, minLength: 1, maxLength: 3000 },
        referenceImages: { type: 'string', required: false },
      },
    },
  },
]
