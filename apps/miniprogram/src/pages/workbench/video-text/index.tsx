/**
 * 文生视频工作台
 * 对应 FR2_视频生成_01_文生视频参数配置
 *
 * - 模型下拉：seedance2 Pro / seedance2 Lite
 * - 分辨率：480p / 720p / 1080p
 * - 宽高比：9:16 / 16:9 / 1:1
 * - 时长：5秒 / 10秒
 * - 提示词：maxLength=2000
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CreditBadge, PromptInput } from '@/components'
import { useCredits } from '@/hooks/useCredits'
import { createGeneration } from '@/services/api/workbench.api'
import { usePointsStore } from '@/stores/points.store'
import './index.scss'

/** 模型选项 */
const MODELS = [
  { value: 'seedance2-pro', label: 'seedance2 Pro' },
  { value: 'seedance2-lite', label: 'seedance2 Lite' },
]

/** 分辨率选项 */
const RESOLUTIONS = ['480p', '720p', '1080p']

/** 宽高比选项 */
const ASPECT_RATIOS = ['9:16', '16:9', '1:1']

/** 时长选项 */
const DURATIONS = [5, 10]

/** 积分表：resolution_duration => points */
const POINTS_TABLE: Record<string, number> = {
  '480p_5': 450,
  '480p_10': 900,
  '720p_5': 900,
  '720p_10': 1800,
  '1080p_5': 1800,
  '1080p_10': 3600,
}

export default function VideoTextWorkbench() {
  // 读取 URL 预填参数（来自对标解析"一键复刻"跳转）
  const instance = Taro.getCurrentInstance()
  const urlParams = instance.router?.params || {}
  const prefillPrompt = urlParams.prompt ? decodeURIComponent(urlParams.prompt) : ''
  const benchmarkId = urlParams.benchmarkId || ''

  const [model, setModel] = useState(MODELS[0].value)
  const [resolution, setResolution] = useState('720p')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [duration, setDuration] = useState(5)
  const [prompt, setPrompt] = useState(prefillPrompt)
  const [submitting, setSubmitting] = useState(false)
  const [showModelSheet, setShowModelSheet] = useState(false)

  // URL 参数变化时同步预填（防止页面缓存时 prefillPrompt 未生效）
  useEffect(() => {
    if (prefillPrompt) {
      setPrompt(prefillPrompt)
    }
  }, [prefillPrompt])

  const { balance } = useCredits()
  const consume = usePointsStore((s) => s.consume)

  /** 预计消耗积分 */
  const estimatedPoints = useMemo(() => {
    return POINTS_TABLE[`${resolution}_${duration}`] ?? 0
  }, [resolution, duration])

  /** 提交生成 */
  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) {
      Taro.showToast({ title: '请输入提示词', icon: 'none' })
      return
    }
    if (balance < estimatedPoints) {
      Taro.showToast({ title: '积分不足', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      const res = await createGeneration({
        generationType: 'TEXT_TO_VIDEO',
        prompt: prompt.trim(),
        model,
        resolution,
        aspectRatio,
        duration: duration as 5 | 10,
        ...(benchmarkId ? { benchmarkId } : {}),
      })
      consume(estimatedPoints)
      Taro.showToast({ title: '生成任务已提交', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/workbench/work-detail/index?workId=${res.workId}`,
        })
      }, 800)
    } catch (err) {
      // 错误已由 request 层统一 toast
    } finally {
      setSubmitting(false)
    }
  }, [
    prompt,
    balance,
    estimatedPoints,
    model,
    resolution,
    aspectRatio,
    duration,
    consume,
    benchmarkId,
  ])

  /** 选择模型 */
  const handleSelectModel = useCallback((value: string) => {
    setModel(value)
    setShowModelSheet(false)
  }, [])

  const currentModelLabel = MODELS.find((m) => m.value === model)?.label ?? ''

  return (
    <View className="video-text-wb page-wrap">
      {/* 顶部：标题 + 积分余额 */}
      <View className="page-wrap__header">
        <Text className="page-wrap__title">视频生成</Text>
        <View className="page-wrap__credits">
          <CreditBadge amount={balance} size="sm" />
        </View>
      </View>

      <View className="video-text-wb__body">
        {/* 复刻模式提示条 */}
        {benchmarkId ? (
          <View className="video-text-wb__replicate-banner">
            <Text className="video-text-wb__replicate-text">✦ 基于对标解析创作</Text>
          </View>
        ) : null}

        {/* 模型选择 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">模型</Text>
          <View className="video-text-wb__select" onClick={() => setShowModelSheet(true)}>
            <Text>{currentModelLabel}</Text>
            <Text className="video-text-wb__select-arrow">›</Text>
          </View>
        </View>

        {/* 分辨率 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">分辨率</Text>
          <View className="page-wrap__row">
            {RESOLUTIONS.map((r) => (
              <View
                key={r}
                className={`page-wrap__chip ${resolution === r ? 'page-wrap__chip--on' : ''}`}
                onClick={() => setResolution(r)}
              >
                <Text>{r}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 宽高比 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">宽高比</Text>
          <View className="page-wrap__row">
            {ASPECT_RATIOS.map((r) => (
              <View
                key={r}
                className={`page-wrap__chip ${aspectRatio === r ? 'page-wrap__chip--on' : ''}`}
                onClick={() => setAspectRatio(r)}
              >
                <Text>{r}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 时长 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">时长（{duration} 秒）</Text>
          <View className="video-text-wb__duration">
            {DURATIONS.map((d) => (
              <View
                key={d}
                className={`video-text-wb__duration-item ${
                  duration === d ? 'video-text-wb__duration-item--on' : ''
                }`}
                onClick={() => setDuration(d)}
              >
                <Text>{d}秒</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 预计消耗积分 */}
        <View className="video-text-wb__estimate">
          <Text className="video-text-wb__estimate-label">预计消耗</Text>
          <Text className="video-text-wb__estimate-value">{estimatedPoints} 积分</Text>
        </View>

        {/* 提示词 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">提示词</Text>
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            maxLength={2000}
            placeholder="描述你想要生成的视频画面、动作、镜头语言..."
          />
        </View>
      </View>

      {/* 底部生成按钮 */}
      <View className="video-text-wb__footer">
        <View
          className={`page-wrap__btn ${
            submitting || !prompt.trim() ? 'page-wrap__btn--disabled' : ''
          }`}
          onClick={handleSubmit}
        >
          <Text>{submitting ? '生成中...' : `开始生成（${estimatedPoints}积分）`}</Text>
        </View>
      </View>

      {/* 模型选择 ActionSheet */}
      {showModelSheet ? (
        <View className="action-sheet" onClick={() => setShowModelSheet(false)}>
          <View className="action-sheet__panel" catchMove onClick={(e) => e.stopPropagation()}>
            <View className="action-sheet__header">
              <Text>选择模型</Text>
            </View>
            {MODELS.map((m) => (
              <View
                key={m.value}
                className={`action-sheet__item ${
                  model === m.value ? 'action-sheet__item--on' : ''
                }`}
                onClick={() => handleSelectModel(m.value)}
              >
                <Text>{m.label}</Text>
                {model === m.value ? <Text className="action-sheet__check">✓</Text> : null}
              </View>
            ))}
            <View className="action-sheet__cancel" onClick={() => setShowModelSheet(false)}>
              <Text>取消</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
