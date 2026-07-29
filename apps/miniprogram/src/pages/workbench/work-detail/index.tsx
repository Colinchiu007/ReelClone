/**
 * 作品详情
 * 对应 FR8_我的作品 - 作品详情
 *
 * - 接收参数：workId
 * - 状态区：生成中显示进度条 + 预计时间（WebSocket 监听 task:progress）
 * - 结果区：已完成显示视频/图片 + 下载按钮
 * - 信息区：创建时间、消耗积分、生成参数
 * - 操作区：重试（失败时）、删除、再创作
 */
import { useState, useCallback, useEffect } from 'react'
import { View, Text, Image, Video, Progress } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { LoadingState, ErrorState } from '@/components'
import {
  getWork,
  deleteWork,
  retryGeneration,
  createGeneration,
} from '@/services/api/workbench.api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Work } from '@/types'
import './index.scss'

/** 状态展示配置 */
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '排队中', cls: 'work-detail__status--pending' },
  PROCESSING: { label: '生成中', cls: 'work-detail__status--processing' },
  COMPLETED: { label: '已完成', cls: 'work-detail__status--completed' },
  FAILED: { label: '生成失败', cls: 'work-detail__status--failed' },
  CANCELLED: { label: '已取消', cls: 'work-detail__status--cancelled' },
}

/** 格式化时间 */
function formatTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

/** 工作台路径映射（用于"再创作"） */
const WORKBENCH_PATHS: Record<string, string> = {
  TEXT_GENERATE: '/pages/workbench/text/index',
  IMAGE_GENERATE: '/pages/workbench/image/index',
  TEXT_TO_VIDEO: '/pages/workbench/video-text/index',
  IMAGE_TO_VIDEO_FIRST: '/pages/workbench/video-image-first/index',
  IMAGE_TO_VIDEO_FIRST_LAST: '/pages/workbench/video-image-first-last/index',
  EDIT_VIDEO: '/pages/workbench/video-edit/index',
  EXTEND_VIDEO: '/pages/workbench/video-extend/index',
}

export default function WorkDetail() {
  const instance = getCurrentInstance()
  const workId = instance.router?.params?.workId ?? ''

  const [work, setWork] = useState<Work | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [progress, setProgress] = useState(0)
  const [operating, setOperating] = useState(false)

  const { subscribe, unsubscribe } = useWebSocket()

  /** 拉取作品详情 */
  const fetchWork = useCallback(async () => {
    if (!workId) {
      setError(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    try {
      const data = await getWork(workId)
      setWork(data)
      if (data.status === 'COMPLETED') {
        setProgress(100)
      }
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [workId])

  /** 下载图片到相册 */
  const handleDownloadImage = useCallback(async (url: string) => {
    Taro.showLoading({ title: '保存中...', mask: true })
    try {
      const res = await Taro.downloadFile({ url })
      if (res.statusCode === 200) {
        await Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
        Taro.showToast({ title: '已保存到相册', icon: 'success' })
      } else {
        Taro.showToast({ title: '下载失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({
        title: '保存失败，请授权相册权限',
        icon: 'none',
      })
    } finally {
      Taro.hideLoading()
    }
  }, [])

  /** 下载视频到相册 */
  const handleDownloadVideo = useCallback(async (url: string) => {
    Taro.showLoading({ title: '保存中...', mask: true })
    try {
      const res = await Taro.downloadFile({ url })
      if (res.statusCode === 200) {
        await Taro.saveVideoToPhotosAlbum({ filePath: res.tempFilePath })
        Taro.showToast({ title: '已保存到相册', icon: 'success' })
      } else {
        Taro.showToast({ title: '下载失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({
        title: '保存失败，请授权相册权限',
        icon: 'none',
      })
    } finally {
      Taro.hideLoading()
    }
  }, [])

  /** 重试（失败时） */
  const handleRetry = useCallback(async () => {
    if (!work) return
    setOperating(true)
    try {
      await retryGeneration(work.id)
      Taro.showToast({ title: '已重新提交', icon: 'success' })
      fetchWork()
    } catch (err) {
      // 错误已由 request 层统一 toast
    } finally {
      setOperating(false)
    }
  }, [work, fetchWork])

  /** 删除作品 */
  const handleDelete = useCallback(async () => {
    if (!work) return
    Taro.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个作品吗？',
      confirmColor: '#EF4444',
    }).then(async (res) => {
      if (!res.confirm) return
      setOperating(true)
      try {
        await deleteWork(work.id)
        Taro.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 800)
      } catch (err) {
        // 错误已由 request 层统一 toast
      } finally {
        setOperating(false)
      }
    })
  }, [work])

  /** 再创作：基于当前参数创建新任务 */
  const handleRecreate = useCallback(async () => {
    if (!work) return
    const path = WORKBENCH_PATHS[work.workType]
    if (path) {
      Taro.navigateTo({ url: path })
      return
    }
    // 未知类型，直接复用参数提交
    setOperating(true)
    try {
      const params = work.params as Record<string, unknown>
      await createGeneration({
        generationType: work.workType,
        prompt: (params.prompt as string) ?? '',
        model: params.model as string | undefined,
        resolution: params.resolution as string | undefined,
        aspectRatio: params.aspectRatio as string | undefined,
        duration: params.duration as 5 | 10 | undefined,
        referenceImages: params.referenceImages as string[] | undefined,
        referenceVideo: params.referenceVideo as string | undefined,
        firstFrame: params.firstFrame as string | undefined,
        lastFrame: params.lastFrame as string | undefined,
      })
      Taro.showToast({ title: '已创建新任务', icon: 'success' })
    } catch (err) {
      // 错误已由 request 层统一 toast
    } finally {
      setOperating(false)
    }
  }, [work])

  /** 发布为模板：跳转到发布模板页 */
  const handlePublishAsTemplate = useCallback(() => {
    if (!workId) return
    Taro.navigateTo({ url: `/pages/workbench/publish-template/index?workId=${workId}` })
  }, [workId])

  /** WebSocket：监听进度 */
  useEffect(() => {
    if (!workId) return

    const progressHandler = (data: unknown) => {
      const payload = data as { workId?: string; progress?: number }
      if (payload?.workId === workId && typeof payload.progress === 'number') {
        setProgress(payload.progress)
      }
    }

    const completedHandler = (data: unknown) => {
      const payload = data as { workId?: string }
      if (payload?.workId === workId) {
        fetchWork()
      }
    }

    const failedHandler = (data: unknown) => {
      const payload = data as { workId?: string }
      if (payload?.workId === workId) {
        fetchWork()
      }
    }

    subscribe('task:progress', progressHandler)
    subscribe('task:completed', completedHandler)
    subscribe('task:failed', failedHandler)

    return () => {
      unsubscribe('task:progress', progressHandler)
      unsubscribe('task:completed', completedHandler)
      unsubscribe('task:failed', failedHandler)
    }
  }, [workId, subscribe, unsubscribe, fetchWork])

  /** 初次加载 */
  useEffect(() => {
    fetchWork()
  }, [fetchWork])

  if (loading) {
    return (
      <View className="work-detail">
        <LoadingState fullScreen title="加载中..." />
      </View>
    )
  }

  if (error || !work) {
    return (
      <View className="work-detail">
        <ErrorState title="加载失败" description="作品不存在或加载失败" onRetry={fetchWork} />
      </View>
    )
  }

  const statusCfg = STATUS_CONFIG[work.status] ?? STATUS_CONFIG.PENDING
  const isProcessing = work.status === 'PENDING' || work.status === 'PROCESSING'
  const isCompleted = work.status === 'COMPLETED'
  const isFailed = work.status === 'FAILED' || work.status === 'CANCELLED'
  const isVideo =
    work.workType.includes('VIDEO') ||
    work.workType.includes('EXTEND') ||
    work.workType === 'EDIT_VIDEO'

  // 生成参数摘要
  const params = work.params as Record<string, unknown>
  const paramEntries = Object.entries(params).filter(
    ([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'idempotencyKey',
  )

  return (
    <View className="work-detail">
      {/* 顶部导航 */}
      <View className="work-detail__nav">
        <View className="work-detail__back" onClick={() => Taro.navigateBack()}>
          <Text>‹</Text>
        </View>
        <Text className="work-detail__nav-title">作品详情</Text>
        <View className="work-detail__nav-placeholder" />
      </View>

      <View className="work-detail__body">
        {/* 状态区 */}
        <View className="work-detail__status-section">
          <View className={`work-detail__status ${statusCfg.cls}`}>
            <Text>{statusCfg.label}</Text>
          </View>
          {isProcessing ? (
            <View className="work-detail__progress-wrap">
              <Progress
                percent={progress}
                strokeWidth={6}
                activeColor="#7C3AED"
                backgroundColor="#2A2B45"
                active
              />
              <Text className="work-detail__progress-text">{progress}% · 预计 1-3 分钟</Text>
            </View>
          ) : null}
          {isFailed && work.subStatus ? (
            <Text className="work-detail__error-msg">{work.subStatus}</Text>
          ) : null}
        </View>

        {/* 结果区 */}
        {isCompleted && work.resultUrl ? (
          <View className="work-detail__result">
            {isVideo ? (
              <Video
                className="work-detail__video"
                src={work.resultUrl}
                controls
                showFullscreenBtn
                showCenterPlayBtn
                objectFit="contain"
              />
            ) : (
              <Image
                className="work-detail__image"
                src={work.resultUrl}
                mode="widthFix"
                onClick={() => Taro.previewImage({ urls: [work.resultUrl!] })}
              />
            )}
            <View
              className="work-detail__download"
              onClick={() =>
                isVideo
                  ? handleDownloadVideo(work.resultUrl!)
                  : handleDownloadImage(work.resultUrl!)
              }
            >
              <Text>保存到相册</Text>
            </View>
          </View>
        ) : null}

        {/* 信息区 */}
        <View className="work-detail__info">
          <View className="work-detail__info-row">
            <Text className="work-detail__info-label">作品 ID</Text>
            <Text className="work-detail__info-value">{work.id}</Text>
          </View>
          <View className="work-detail__info-row">
            <Text className="work-detail__info-label">类型</Text>
            <Text className="work-detail__info-value">{work.workType}</Text>
          </View>
          <View className="work-detail__info-row">
            <Text className="work-detail__info-label">创建时间</Text>
            <Text className="work-detail__info-value">{formatTime(work.createdAt)}</Text>
          </View>
          {work.completedAt ? (
            <View className="work-detail__info-row">
              <Text className="work-detail__info-label">完成时间</Text>
              <Text className="work-detail__info-value">{formatTime(work.completedAt)}</Text>
            </View>
          ) : null}
          <View className="work-detail__info-row">
            <Text className="work-detail__info-label">消耗积分</Text>
            <Text className="work-detail__info-value">{work.consumedPoints} 积分</Text>
          </View>
        </View>

        {/* 生成参数 */}
        {paramEntries.length > 0 ? (
          <View className="work-detail__params">
            <Text className="work-detail__params-title">生成参数</Text>
            {paramEntries.map(([k, v]) => (
              <View key={k} className="work-detail__info-row">
                <Text className="work-detail__info-label">{k}</Text>
                <Text className="work-detail__info-value">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* 操作区 */}
      <View className="work-detail__actions">
        {isFailed ? (
          <View
            className={`work-detail__action work-detail__action--primary ${
              operating ? 'work-detail__action--disabled' : ''
            }`}
            onClick={handleRetry}
          >
            <Text>重试</Text>
          </View>
        ) : null}
        <View
          className={`work-detail__action ${operating ? 'work-detail__action--disabled' : ''}`}
          onClick={handleRecreate}
        >
          <Text>再创作</Text>
        </View>
        {isCompleted ? (
          <View
            className={`work-detail__action work-detail__action--primary ${
              operating ? 'work-detail__action--disabled' : ''
            }`}
            onClick={handlePublishAsTemplate}
          >
            <Text>发布为模板</Text>
          </View>
        ) : null}
        <View
          className={`work-detail__action work-detail__action--danger ${
            operating ? 'work-detail__action--disabled' : ''
          }`}
          onClick={handleDelete}
        >
          <Text>删除</Text>
        </View>
      </View>
    </View>
  )
}
