/**
 * 我的上传页（template 分包）
 * 对应 FR-09 — 用户查看自己上传的模板列表
 *
 * 功能：
 *  - Tab 筛选：全部 / 分析中 / 已完成 / 失败
 *  - 列表展示用户上传的模板（listMyUploaded）
 *  - ANALYZING 状态自动轮询刷新（2s 间隔）
 *  - ANALYSIS_FAILED 状态显示失败原因 + 重试按钮（跳转上传页）
 *  - ACTIVE 状态点击跳转模板详情
 *  - 顶部"上传新视频"入口按钮
 *  - 上拉加载更多
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useReachBottom } from '@tarojs/taro'
import { TemplateCard, EmptyState, LoadingState, ErrorState } from '@/components'
import { listMyUploaded } from '@/services/api/template.api'
import type { Template, TemplateStatus } from '@/types'
import './index.scss'

/** Tab 筛选项 */
type TabKey = 'all' | 'analyzing' | 'active' | 'failed'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'analyzing', label: '分析中' },
  { key: 'active', label: '已完成' },
  { key: 'failed', label: '失败' },
]

const PAGE_SIZE = 20
const POLL_INTERVAL_MS = 2000

/** 状态标签映射 */
const STATUS_TAG: Record<TemplateStatus, { text: string; cls: string }> = {
  ACTIVE: { text: '已完成', cls: 'my-upload__tag--active' },
  ANALYZING: { text: '分析中', cls: 'my-upload__tag--analyzing' },
  ANALYSIS_FAILED: { text: '失败', cls: 'my-upload__tag--failed' },
  PENDING_REVIEW: { text: '待审核', cls: 'my-upload__tag--review' },
}

export default function MyUploadedPage() {
  const [tab, setTab] = useState<TabKey>('all')
  const [list, setList] = useState<Template[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(false)

  // 轮询定时器（仅在存在 ANALYZING 项时启用）
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 清理轮询 */
  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearPoll(), [clearPoll])

  /** 拉取列表 */
  const fetchList = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(false)
    try {
      const res = await listMyUploaded({ page: pageNum, pageSize: PAGE_SIZE })
      const items = res?.data?.list || []
      setList((prev) => (replace ? items : [...prev, ...items]))
      setHasMore(items.length >= PAGE_SIZE)
      setPage(pageNum)
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Tab 切换或首次加载
  useEffect(() => {
    fetchList(1, true)
  }, [fetchList])

  // 检测 ANALYZING 项 → 启动轮询
  const hasAnalyzing = list.some((t) => t.status === 'ANALYZING')
  useEffect(() => {
    clearPoll()
    if (!hasAnalyzing) return
    pollTimerRef.current = setTimeout(() => {
      fetchList(1, true)
    }, POLL_INTERVAL_MS)
  }, [hasAnalyzing, clearPoll, fetchList])

  // 上拉加载更多
  useReachBottom(() => {
    if (!loading && !loadingMore && hasMore && !error) {
      fetchList(page + 1, false)
    }
  })

  /** Tab 筛选后的列表 */
  const filteredList = list.filter((t) => {
    if (tab === 'all') return true
    if (tab === 'analyzing') return t.status === 'ANALYZING'
    if (tab === 'active') return t.status === 'ACTIVE'
    if (tab === 'failed') return t.status === 'ANALYSIS_FAILED'
    return true
  })

  /** 跳转上传页 */
  const handleUpload = useCallback(() => {
    Taro.navigateTo({ url: '/pages/template/upload/index' })
  }, [])

  /** 点击卡片跳转详情（仅 ACTIVE 可跳转） */
  const handleCardClick = useCallback((id: string) => {
    Taro.navigateTo({ url: `/pages/template/detail/index?templateId=${id}` })
  }, [])

  /** 重试失败的模板（跳转上传页重新上传） */
  const handleRetry = useCallback(() => {
    Taro.navigateTo({ url: '/pages/template/upload/index' })
  }, [])

  // 瀑布流双列
  const leftColumn = filteredList.filter((_, i) => i % 2 === 0)
  const rightColumn = filteredList.filter((_, i) => i % 2 === 1)

  /** 渲染单张卡片 + 状态标签覆盖层 */
  const renderCard = (t: Template) => {
    const status = t.status ?? 'ACTIVE'
    const tag = STATUS_TAG[status]
    return (
      <View key={t.id} className="my-upload__item">
        <TemplateCard
          template={{
            id: t.id,
            title: t.title,
            coverUrl: t.coverUrl,
            platform: t.platform,
            author: t.author,
            playCount: t.playCount,
            iqScore: t.iqScore,
          }}
          onClick={status === 'ACTIVE' ? handleCardClick : undefined}
        />
        {/* 状态标签覆盖在卡片顶部 */}
        <View className={`my-upload__tag ${tag.cls}`}>
          <Text>{tag.text}</Text>
        </View>
        {/* 失败原因 + 重试按钮 */}
        {status === 'ANALYSIS_FAILED' ? (
          <View className="my-upload__fail-info">
            {t.failureReason ? (
              <Text className="my-upload__fail-reason">{t.failureReason}</Text>
            ) : null}
            <Text className="my-upload__retry-btn" onClick={handleRetry}>
              重新上传
            </Text>
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View className="my-upload">
      {/* -------------------- 顶部导航 -------------------- */}
      <View className="my-upload__nav">
        <View className="my-upload__back" onClick={() => Taro.navigateBack()}>
          <Text>‹</Text>
        </View>
        <Text className="my-upload__nav-title">我的上传</Text>
        <View className="my-upload__upload-btn" onClick={handleUpload}>
          <Text>+ 上传</Text>
        </View>
      </View>

      {/* -------------------- Tab 筛选 -------------------- */}
      <View className="my-upload__tabs">
        {TABS.map((t) => (
          <View
            key={t.key}
            className={`my-upload__tab ${tab === t.key ? 'my-upload__tab--on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <Text>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* -------------------- 列表 -------------------- */}
      <View className="my-upload__list">
        {loading && filteredList.length === 0 ? (
          <LoadingState />
        ) : error && filteredList.length === 0 ? (
          <ErrorState onRetry={() => fetchList(1, true)} />
        ) : filteredList.length === 0 ? (
          <EmptyState
            title="还没有上传过模板"
            description="上传一段视频，让 AI 帮你生成可复用的创作模板"
            icon="🎬"
          />
        ) : (
          <View className="my-upload__waterfall">
            <View className="my-upload__col">{leftColumn.map(renderCard)}</View>
            <View className="my-upload__col">{rightColumn.map(renderCard)}</View>
          </View>
        )}

        {loadingMore ? (
          <View className="my-upload__status">
            <Text>加载中...</Text>
          </View>
        ) : null}
        {!loadingMore && !hasMore && filteredList.length > 0 ? (
          <View className="my-upload__status">
            <Text>已经到底啦</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
