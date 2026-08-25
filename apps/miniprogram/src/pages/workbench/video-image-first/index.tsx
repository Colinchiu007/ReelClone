/**
 * 图生视频-首帧 工作台
 * 对应 FR2_视频生成_02_图生视频首帧
 *
 * - 首帧上传：MediaUploader(type=image, maxCount=1)
 * - 参数：模型 / 分辨率 / 宽高比 / 时长
 * - 提示词：可选
 */
import { useState, useCallback, useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { CreditBadge, MediaUploader, PromptInput } from '@/components'
import { useCredits } from '@/hooks/useCredits'
import { createGeneration } from '@/services/api/workbench.api'
import { usePointsStore } from '@/stores/points.store'
import {
  GenerationType,
  getPointsTable,
  getResolutions,
  getAspectRatios,
  getDurations,
  getModels,
  getMaxPromptLength,
} from '@/utils/capabilities'
import type { GenerationResolution, GenerationAspectRatio } from '@/types'
import './index.scss'

/** 生成类型 */
const TYPE = GenerationType.IMAGE_TO_VIDEO_FIRST

export default function VideoImageFirstWorkbench() {
  useLoad(() => Taro.setNavigationBarTitle({ title: '首帧生视频' }))
  const MODELS = useMemo(() => getModels(TYPE), [])
  const RESOLUTIONS = useMemo<GenerationResolution[]>(
    () => getResolutions(TYPE) as GenerationResolution[],
    [],
  )
  const ASPECT_RATIOS = useMemo<GenerationAspectRatio[]>(
    () => getAspectRatios(TYPE) as GenerationAspectRatio[],
    [],
  )
  const DURATIONS = useMemo(() => getDurations(TYPE), [])
  const POINTS_TABLE = useMemo(() => getPointsTable(TYPE), [])

  const [firstFrame, setFirstFrame] = useState<string[]>([])
  const [model, setModel] = useState(MODELS[0].value)
  const [resolution, setResolution] = useState<GenerationResolution>('720p')
  const [aspectRatio, setAspectRatio] = useState<GenerationAspectRatio>('9:16')
  const [duration, setDuration] = useState(5)
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showModelSheet, setShowModelSheet] = useState(false)

  const { balance } = useCredits()
  const consume = usePointsStore((s) => s.consume)

  const estimatedPoints = useMemo(() => {
    return POINTS_TABLE[`${resolution}_${duration}`] ?? 0
  }, [resolution, duration])

  const handleSubmit = useCallback(async () => {
    if (firstFrame.length === 0) {
      Taro.showToast({ title: '请上传首帧图片', icon: 'none' })
      return
    }
    if (balance < estimatedPoints) {
      Taro.showToast({ title: '积分不足', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      const res = await createGeneration({
        generationType: 'IMAGE_TO_VIDEO_FIRST',
        prompt: prompt.trim(),
        firstFrame: firstFrame[0],
        model,
        resolution,
        aspectRatio,
        duration: duration as 5 | 10,
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
    firstFrame,
    prompt,
    balance,
    estimatedPoints,
    model,
    resolution,
    aspectRatio,
    duration,
    consume,
  ])

  const currentModelLabel = MODELS.find((m) => m.value === model)?.label ?? ''

  return (
    <View className="video-img-first-wb page-wrap">
      <View className="page-wrap__header">
        <Text className="page-wrap__title">图生视频 · 首帧</Text>
        <View className="page-wrap__credits">
          <CreditBadge amount={balance} size="sm" />
        </View>
      </View>

      <View className="video-img-first-wb__body">
        {/* 首帧上传 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">首帧图片 *</Text>
          <MediaUploader type="image" maxCount={1} value={firstFrame} onChange={setFirstFrame} />
        </View>

        {/* 模型选择 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">模型</Text>
          <View className="video-img-first-wb__select" onClick={() => setShowModelSheet(true)}>
            <Text>{currentModelLabel}</Text>
            <Text className="video-img-first-wb__select-arrow">›</Text>
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
          <Text className="page-wrap__label">时长</Text>
          <View className="video-img-first-wb__duration">
            {DURATIONS.map((d) => (
              <View
                key={d}
                className={`video-img-first-wb__duration-item ${
                  duration === d ? 'video-img-first-wb__duration-item--on' : ''
                }`}
                onClick={() => setDuration(d)}
              >
                <Text>{d}秒</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 预计消耗积分 */}
        <View className="video-img-first-wb__estimate">
          <Text className="video-img-first-wb__estimate-label">预计消耗</Text>
          <Text className="video-img-first-wb__estimate-value">{estimatedPoints} 积分</Text>
        </View>

        {/* 提示词（可选） */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">提示词（可选）</Text>
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            maxLength={getMaxPromptLength(TYPE)}
            placeholder="描述视频的运动、镜头变化等（可选）"
          />
        </View>
      </View>

      <View className="video-img-first-wb__footer">
        <View
          className={`page-wrap__btn ${
            submitting || firstFrame.length === 0 ? 'page-wrap__btn--disabled' : ''
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
                onClick={() => {
                  setModel(m.value)
                  setShowModelSheet(false)
                }}
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
