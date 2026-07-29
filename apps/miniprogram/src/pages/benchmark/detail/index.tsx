/**
 * 对标解析详情页
 *
 * - 接收参数：id（benchmarkId）
 * - 加载状态：解析中（PENDING / ANALYZING）显示 LoadingState
 * - 已完成：展示结构化报告（风格、节奏、镜头脚本、文案、卖点、模板建议）
 * - 失败：显示 ErrorState 支持重试
 * - 底部：固定"一键复刻"按钮（仅 COMPLETED 显示），点击调用 clone 接口并跳转工作台
 */
import { useState, useCallback, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { LoadingState, ErrorState } from '@/components'
import { getBenchmarkDetail, cloneBenchmark } from '@/services/api/benchmark.api'
import type { Benchmark } from '@/types'
import type { StructuredReport, ShotItem } from '@/services/api/benchmark.api'
import './index.scss'

/** 状态展示配置 */
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '排队中', cls: 'benchmark-detail__status--pending' },
  ANALYZING: { label: '解析中', cls: 'benchmark-detail__status--analyzing' },
  PROCESSING: { label: '解析中', cls: 'benchmark-detail__status--analyzing' },
  COMPLETED: { label: '已完成', cls: 'benchmark-detail__status--completed' },
  FAILED: { label: '解析失败', cls: 'benchmark-detail__status--failed' },
  CANCELLED: { label: '已取消', cls: 'benchmark-detail__status--cancelled' },
}

/** 解析中状态集合 */
const PENDING_STATES = new Set(['PENDING', 'ANALYZING', 'PROCESSING'])

/** 格式化时间 */
function formatTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 安全读取结构化报告 */
function parseReport(raw: unknown): StructuredReport | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  return {
    style: (obj.style as string) ?? '',
    pacing: (obj.pacing as string) ?? '',
    shotList: Array.isArray(obj.shotList) ? (obj.shotList as ShotItem[]) : [],
    copywriting: (obj.copywriting as StructuredReport['copywriting']) ?? {
      hook: '',
      body: '',
      cta: '',
    },
    sellingPoints: Array.isArray(obj.sellingPoints) ? (obj.sellingPoints as string[]) : [],
    templateSuggestion: (obj.templateSuggestion as string) ?? '',
  }
}

export default function BenchmarkDetail() {
  const instance = getCurrentInstance()
  const benchmarkId = instance.router?.params?.id ?? ''

  const [benchmark, setBenchmark] = useState<Benchmark | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [cloning, setCloning] = useState(false)

  /** 拉取解析详情 */
  const fetchDetail = useCallback(async () => {
    if (!benchmarkId) {
      setError(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    try {
      const data = await getBenchmarkDetail(benchmarkId)
      setBenchmark(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [benchmarkId])

  /** 一键复刻 */
  const handleClone = useCallback(async () => {
    if (!benchmarkId || cloning) return
    setCloning(true)
    try {
      const result = await cloneBenchmark(benchmarkId)
      Taro.navigateTo({
        url: `/pages/workbench/video-text/index?prompt=${encodeURIComponent(result.prompt)}&benchmarkId=${result.benchmarkId}`,
      })
    } catch {
      // 错误已由 request 层统一 toast
    } finally {
      setCloning(false)
    }
  }, [benchmarkId, cloning])

  /** 初次加载 */
  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // -------------------- 渲染：加载中 --------------------
  if (loading) {
    return (
      <View className="benchmark-detail">
        <View className="benchmark-detail__nav">
          <View className="benchmark-detail__back" onClick={() => Taro.navigateBack()}>
            <Text>‹</Text>
          </View>
          <Text className="benchmark-detail__nav-title">解析详情</Text>
          <View className="benchmark-detail__nav-placeholder" />
        </View>
        <LoadingState fullScreen title="正在加载..." />
      </View>
    )
  }

  // -------------------- 渲染：加载失败 --------------------
  if (error || !benchmark) {
    return (
      <View className="benchmark-detail">
        <View className="benchmark-detail__nav">
          <View className="benchmark-detail__back" onClick={() => Taro.navigateBack()}>
            <Text>‹</Text>
          </View>
          <Text className="benchmark-detail__nav-title">解析详情</Text>
          <View className="benchmark-detail__nav-placeholder" />
        </View>
        <ErrorState title="加载失败" description="解析记录不存在或加载失败" onRetry={fetchDetail} />
      </View>
    )
  }

  const status = benchmark.status || 'PENDING'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING
  const isPending = PENDING_STATES.has(status)
  const isCompleted = status === 'COMPLETED'
  const isFailed = status === 'FAILED' || status === 'CANCELLED'
  const report = isCompleted ? parseReport(benchmark.analysisResult) : null

  // -------------------- 渲染：解析中 --------------------
  if (isPending) {
    return (
      <View className="benchmark-detail">
        <View className="benchmark-detail__nav">
          <View className="benchmark-detail__back" onClick={() => Taro.navigateBack()}>
            <Text>‹</Text>
          </View>
          <Text className="benchmark-detail__nav-title">解析详情</Text>
          <View className="benchmark-detail__nav-placeholder" />
        </View>
        <View className="benchmark-detail__pending">
          <LoadingState title="正在解析中..." />
          <Text className="benchmark-detail__pending-hint">
            视频结构化解析通常需要 1-3 分钟，请稍候返回查看
          </Text>
          <View className="benchmark-detail__refresh" onClick={fetchDetail}>
            <Text>刷新状态</Text>
          </View>
        </View>
      </View>
    )
  }

  // -------------------- 渲染：失败 --------------------
  if (isFailed) {
    return (
      <View className="benchmark-detail">
        <View className="benchmark-detail__nav">
          <View className="benchmark-detail__back" onClick={() => Taro.navigateBack()}>
            <Text>‹</Text>
          </View>
          <Text className="benchmark-detail__nav-title">解析详情</Text>
          <View className="benchmark-detail__nav-placeholder" />
        </View>
        <View className="benchmark-detail__body">
          <View className="benchmark-detail__failed">
            <View className="benchmark-detail__failed-icon">⚠️</View>
            <Text className="benchmark-detail__failed-title">{statusCfg.label}</Text>
            {benchmark.errorMessage ? (
              <Text className="benchmark-detail__failed-msg">{benchmark.errorMessage}</Text>
            ) : null}
            <View className="benchmark-detail__refresh" onClick={fetchDetail}>
              <Text>重新加载</Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  // -------------------- 渲染：已完成（结构化报告） --------------------
  return (
    <View className="benchmark-detail">
      {/* 顶部导航 */}
      <View className="benchmark-detail__nav">
        <View className="benchmark-detail__back" onClick={() => Taro.navigateBack()}>
          <Text>‹</Text>
        </View>
        <Text className="benchmark-detail__nav-title">解析详情</Text>
        <View className="benchmark-detail__nav-placeholder" />
      </View>

      <View className="benchmark-detail__body">
        {/* 概览卡片 */}
        <View className="benchmark-detail__overview">
          <View className="benchmark-detail__overview-header">
            <Text className="benchmark-detail__overview-title">解析概览</Text>
            <View className={`benchmark-detail__status ${statusCfg.cls}`}>
              <Text>{statusCfg.label}</Text>
            </View>
          </View>
          <View className="benchmark-detail__info-row">
            <Text className="benchmark-detail__info-label">来源平台</Text>
            <Text className="benchmark-detail__info-value">{benchmark.platform || '未知'}</Text>
          </View>
          <View className="benchmark-detail__info-row">
            <Text className="benchmark-detail__info-label">创建时间</Text>
            <Text className="benchmark-detail__info-value">{formatTime(benchmark.createdAt)}</Text>
          </View>
          {benchmark.completedAt ? (
            <View className="benchmark-detail__info-row">
              <Text className="benchmark-detail__info-label">完成时间</Text>
              <Text className="benchmark-detail__info-value">
                {formatTime(benchmark.completedAt)}
              </Text>
            </View>
          ) : null}
          <View className="benchmark-detail__info-row">
            <Text className="benchmark-detail__info-label">消耗积分</Text>
            <Text className="benchmark-detail__info-value">
              {benchmark.consumedPoints ?? 0} 积分
            </Text>
          </View>
        </View>

        {report ? (
          <>
            {/* 1. 视频整体风格 */}
            <View className="benchmark-detail__section">
              <Text className="benchmark-detail__section-title">视频整体风格</Text>
              <View className="benchmark-detail__section-content">
                <Text className="benchmark-detail__paragraph">
                  {report.style || '暂无风格描述'}
                </Text>
              </View>
            </View>

            {/* 2. 节奏分析 */}
            <View className="benchmark-detail__section">
              <Text className="benchmark-detail__section-title">节奏分析</Text>
              <View className="benchmark-detail__section-content">
                <Text className="benchmark-detail__paragraph">
                  {report.pacing || '暂无节奏分析'}
                </Text>
              </View>
            </View>

            {/* 3. 镜头脚本列表 */}
            <View className="benchmark-detail__section">
              <Text className="benchmark-detail__section-title">
                镜头脚本（{report.shotList.length} 个镜头）
              </Text>
              <View className="benchmark-detail__shot-list">
                {report.shotList.length === 0 ? (
                  <Text className="benchmark-detail__empty-inline">暂无镜头数据</Text>
                ) : (
                  report.shotList.map((shot, idx) => (
                    <View key={idx} className="benchmark-detail__shot-item">
                      <View className="benchmark-detail__shot-header">
                        <Text className="benchmark-detail__shot-index">
                          场景 {shot.sceneIndex ?? idx + 1}
                        </Text>
                        {shot.duration ? (
                          <Text className="benchmark-detail__shot-duration">{shot.duration}s</Text>
                        ) : null}
                      </View>
                      {shot.visual ? (
                        <View className="benchmark-detail__shot-field">
                          <Text className="benchmark-detail__shot-field-label">画面</Text>
                          <Text className="benchmark-detail__shot-field-value">{shot.visual}</Text>
                        </View>
                      ) : null}
                      {shot.voiceover ? (
                        <View className="benchmark-detail__shot-field">
                          <Text className="benchmark-detail__shot-field-label">口播</Text>
                          <Text className="benchmark-detail__shot-field-value">
                            {shot.voiceover}
                          </Text>
                        </View>
                      ) : null}
                      {shot.onScreenText ? (
                        <View className="benchmark-detail__shot-field">
                          <Text className="benchmark-detail__shot-field-label">画面文字</Text>
                          <Text className="benchmark-detail__shot-field-value">
                            {shot.onScreenText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* 4. 文案拆解 */}
            <View className="benchmark-detail__section">
              <Text className="benchmark-detail__section-title">文案拆解</Text>
              <View className="benchmark-detail__copywriting">
                <View className="benchmark-detail__copy-item">
                  <Text className="benchmark-detail__copy-label">钩子</Text>
                  <Text className="benchmark-detail__copy-value">
                    {report.copywriting.hook || '暂无'}
                  </Text>
                </View>
                <View className="benchmark-detail__copy-item">
                  <Text className="benchmark-detail__copy-label">正文</Text>
                  <Text className="benchmark-detail__copy-value">
                    {report.copywriting.body || '暂无'}
                  </Text>
                </View>
                <View className="benchmark-detail__copy-item">
                  <Text className="benchmark-detail__copy-label">行动号召</Text>
                  <Text className="benchmark-detail__copy-value">
                    {report.copywriting.cta || '暂无'}
                  </Text>
                </View>
              </View>
            </View>

            {/* 5. 卖点提炼 */}
            <View className="benchmark-detail__section">
              <Text className="benchmark-detail__section-title">卖点提炼</Text>
              <View className="benchmark-detail__selling-points">
                {report.sellingPoints.length === 0 ? (
                  <Text className="benchmark-detail__empty-inline">暂无卖点</Text>
                ) : (
                  report.sellingPoints.map((point, idx) => (
                    <View key={idx} className="benchmark-detail__selling-point">
                      <Text className="benchmark-detail__selling-point-index">{idx + 1}</Text>
                      <Text className="benchmark-detail__selling-point-text">{point}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* 6. 模板建议 */}
            <View className="benchmark-detail__section">
              <Text className="benchmark-detail__section-title">模板建议</Text>
              <View className="benchmark-detail__section-content">
                <Text className="benchmark-detail__paragraph">
                  {report.templateSuggestion || '暂无模板建议'}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View className="benchmark-detail__section">
            <Text className="benchmark-detail__empty-inline">解析报告数据为空</Text>
          </View>
        )}
      </View>

      {/* 底部一键复刻按钮 */}
      {isCompleted ? (
        <View className="benchmark-detail__footer">
          <View
            className={`benchmark-detail__clone-btn ${cloning ? 'benchmark-detail__clone-btn--loading' : ''}`}
            onClick={handleClone}
          >
            <Text>{cloning ? '生成参数中...' : '一键复刻'}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}
