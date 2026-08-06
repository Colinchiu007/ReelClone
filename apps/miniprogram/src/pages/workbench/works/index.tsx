/**
 * 我的作品列表
 * 对应 FR8_我的作品_01_作品列表
 *
 * - 顶部 Tab：全部 / 生成中 / 已完成 / 失败
 * - 列表：WorkCard 组件
 * - 分页：上拉加载更多（useReachBottom）
 * - WebSocket：监听 task:completed/task:failed 自动刷新
 */
import { useState, useCallback, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useLoad, useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { WorkCard, EmptyState, LoadingState, ErrorState } from '@/components'
import type { WorkItem, WorkStatus } from '@/components'
import { listWorks } from '@/services/api/workbench.api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Work } from '@/types'
import './index.scss'

/** Tab 选项 */
const TABS: { key: string; label: string; status?: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'processing', label: '生成中', status: 'PROCESSING' },
  { key: 'completed', label: '已完成', status: 'COMPLETED' },
  { key: 'failed', label: '失败', status: 'FAILED' },
]

const PAGE_SIZE = 20

/** Work 类型映射到 WorkItem.workType */
function mapWorkType(workType: string): WorkItem['workType'] {
  const m: Record<string, WorkItem['workType']> = {
    TEXT_GENERATE: 'text',
    IMAGE_GENERATE: 'image',
    TEXT_TO_VIDEO: 'video',
    IMAGE_TO_VIDEO_FIRST: 'video',
    IMAGE_TO_VIDEO_FIRST_LAST: 'video',
    EDIT_VIDEO: 'edit',
    EXTEND_VIDEO: 'extend',
    BENCHMARK: 'benchmark',
    TEMPLATE: 'template',
  }
  return m[workType] ?? 'video'
}

/** Work.status 映射到 WorkItem.status */
function mapWorkStatus(status: string): WorkStatus {
  const m: Record<string, WorkStatus> = {
    PENDING: 'generating',
    PROCESSING: 'generating',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'failed',
  }
  return m[status] ?? 'generating'
}

/** Work 转换为 WorkCard 所需的 WorkItem */
function toWorkItem(work: Work): WorkItem {
  return {
    id: work.id,
    title: `${work.workType} · ${work.id.slice(-6)}`,
    coverUrl: work.coverUrl,
    status: mapWorkStatus(work.status),
    workType: mapWorkType(work.workType),
    createdAt: work.createdAt,
  }
}

export default function WorksList() {
  useLoad(() => Taro.setNavigationBarTitle({ title: '我的作品' }))

  const [activeTab, setActiveTab] = useState('all')
  const [works, setWorks] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const { subscribe, unsubscribe } = useWebSocket()

  /** 拉取作品列表 */
  const fetchWorks = useCallback(
    async (pageNum = 1, append = false) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError(false)

      try {
        const tab = TABS.find((t) => t.key === activeTab)
        const res = await listWorks({
          status: tab?.status,
          page: pageNum,
          pageSize: PAGE_SIZE,
        })
        const items = res.data.list.map(toWorkItem)
        setWorks((prev) => (append ? [...prev, ...items] : items))
        setTotal(res.data.total)
        setPage(pageNum)
      } catch (err) {
        setError(true)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [activeTab],
  )

  /** 切换 Tab */
  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTab(key)
      setWorks([])
      fetchWorks(1, false)
    },
    [fetchWorks],
  )

  /** 点击作品 → 跳转详情 */
  const handleWorkClick = useCallback((id: string) => {
    Taro.navigateTo({
      url: `/pages/workbench/work-detail/index?workId=${id}`,
    })
  }, [])

  /** 页面显示时刷新 */
  useDidShow(() => {
    fetchWorks(1, false)
  })

  /** 下拉刷新 */
  usePullDownRefresh(() => {
    fetchWorks(1, false).then(() => {
      Taro.stopPullDownRefresh()
    })
  })

  /** 上拉加载更多 */
  useReachBottom(() => {
    if (loadingMore || loading) return
    if (works.length >= total) return
    fetchWorks(page + 1, true)
  })

  /** WebSocket 监听：任务完成/失败自动刷新 */
  useEffect(() => {
    const handler = () => {
      fetchWorks(1, false)
    }
    subscribe('task:completed', handler)
    subscribe('task:failed', handler)
    return () => {
      unsubscribe('task:completed', handler)
      unsubscribe('task:failed', handler)
    }
  }, [subscribe, unsubscribe, fetchWorks])

  const hasMore = works.length < total

  return (
    <View className="works-list page-wrap">
      {/* 顶部 Tab */}
      <View className="works-list__tabs">
        {TABS.map((tab) => (
          <View
            key={tab.key}
            className={`works-list__tab ${activeTab === tab.key ? 'works-list__tab--on' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      {/* 内容区 */}
      <View className="works-list__content">
        {loading && works.length === 0 ? (
          <LoadingState title="加载中..." />
        ) : error && works.length === 0 ? (
          <ErrorState
            title="加载失败"
            description="请检查网络后重试"
            onRetry={() => fetchWorks(1, false)}
          />
        ) : works.length === 0 ? (
          <EmptyState title="暂无作品" description="去工作台创作你的第一个作品吧" icon="🎬" />
        ) : (
          <View className="works-list__grid">
            {works.map((work) => (
              <WorkCard key={work.id} work={work} onClick={handleWorkClick} />
            ))}
          </View>
        )}

        {/* 加载更多 */}
        {loadingMore ? (
          <View className="works-list__loading-more">
            <Text>加载中...</Text>
          </View>
        ) : !hasMore && works.length > 0 ? (
          <View className="works-list__no-more">
            <Text>没有更多了</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
