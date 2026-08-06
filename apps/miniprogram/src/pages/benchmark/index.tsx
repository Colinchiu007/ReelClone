import { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useLoad, useDidShow, useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { CreditBadge, LoadingState, ErrorState, EmptyState } from '@/components'
import { createBenchmark, listBenchmarks } from '@/services/api/benchmark.api'
import { getBalance } from '@/services/api/billing.api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { usePointsStore } from '@/stores/points.store'
import type { Benchmark } from '@/types'
import { PLATFORM_METADATA } from '@/utils/platform'
import './index.scss'

const UNKNOWN_PLATFORM = { label: '未知平台', icon: '🔗' }

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '排队中', cls: 'benchmark__status--pending' },
  PROCESSING: { label: '分析中', cls: 'benchmark__status--processing' },
  COMPLETED: { label: '已完成', cls: 'benchmark__status--completed' },
  FAILED: { label: '失败', cls: 'benchmark__status--failed' },
  CANCELLED: { label: '已取消', cls: 'benchmark__status--cancelled' },
}

function getPlatformMeta(platform: string) {
  return PLATFORM_METADATA[platform as keyof typeof PLATFORM_METADATA] || UNKNOWN_PLATFORM
}

function getStatusMeta(status: string): { label: string; cls: string } {
  return STATUS_MAP[status] || { label: status, cls: '' }
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatUrl(url: string, max = 42): string {
  if (!url) return ''
  return url.length > max ? `${url.slice(0, max)}...` : url
}

export default function Index() {
  const { setBalance } = usePointsStore()
  const [balance, setBalanceState] = useState(0)
  const [sourceUrl, setSourceUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<Benchmark[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(false)
  const { subscribe, unsubscribe } = useWebSocket()
  const wsHandlerRef = useRef<((data: unknown) => void) | null>(null)

  const loadBalance = useCallback(async () => {
    try {
      const bal = await getBalance()
      setBalanceState(bal.balance)
      setBalance({ balance: bal.balance, frozen: bal.frozen, total: bal.total })
    } catch {
      // 静默失败
    }
  }, [setBalance])

  const loadHistory = useCallback(async (targetPage = 1, refresh = true) => {
    if (targetPage === 1) {
      setLoading(true)
      setError(false)
    } else {
      setLoadingMore(true)
    }
    try {
      const res = await listBenchmarks({ page: targetPage, pageSize: 20 })
      setHistory((prev) => (refresh ? res.data.list : [...prev, ...res.data.list]))
      setPage(targetPage)
      setHasMore(targetPage * res.data.pageSize < res.data.total)
    } catch {
      if (targetPage === 1) setError(true)
      else Taro.showToast({ title: '加载更多失败', icon: 'none' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: '对标解析' })
    loadBalance()
    loadHistory()
  })

  useDidShow(() => {
    loadBalance()
  })

  useReachBottom(() => {
    if (!loading && !loadingMore && hasMore) loadHistory(page + 1, false)
  })

  usePullDownRefresh(() => {
    loadHistory(1).finally(() => Taro.stopPullDownRefresh())
  })

  // WebSocket 监听 task:completed / task:failed 自动刷新历史
  useEffect(() => {
    const handler = (data: unknown) => {
      const payload = data as { benchmarkId?: string; status?: string } | undefined
      if (payload?.benchmarkId) {
        loadHistory()
        loadBalance()
        Taro.showToast({
          title: payload.status === 'failed' ? '解析失败' : '解析已完成',
          icon: 'none',
        })
      }
    }
    wsHandlerRef.current = handler
    subscribe('task:completed', handler)
    subscribe('task:failed', handler)
    return () => {
      if (wsHandlerRef.current) {
        unsubscribe('task:completed', wsHandlerRef.current)
        unsubscribe('task:failed', wsHandlerRef.current)
      }
    }
  }, [subscribe, unsubscribe, loadHistory, loadBalance])

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      Taro.showToast({ title: '请输入视频链接', icon: 'none' })
      return false
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      Taro.showToast({ title: '请输入有效的链接', icon: 'none' })
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    const url = sourceUrl.trim()
    if (!validateUrl(url)) return
    setSubmitting(true)
    try {
      const result = await createBenchmark({ sourceUrl: url })
      Taro.showToast({ title: '已提交，分析中...', icon: 'none' })
      setSourceUrl('')
      // 刷新历史列表
      await loadHistory()
      await loadBalance()
      // 跳转到详情页
      if (result.benchmarkId) {
        Taro.navigateTo({ url: `/pages/benchmark/detail/index?id=${result.benchmarkId}` })
      }
    } catch {
      // request 层已统一 toast
    } finally {
      setSubmitting(false)
    }
  }

  const handleHistoryClick = (item: Benchmark) => {
    Taro.navigateTo({ url: `/pages/benchmark/detail/index?id=${item.id}` })
  }

  const handlePaste = async () => {
    try {
      const { data } = await Taro.getClipboardData()
      if (data) {
        setSourceUrl(data)
        Taro.showToast({ title: '已粘贴', icon: 'none', duration: 800 })
      }
    } catch {
      // 忽略
    }
  }

  return (
    <View className="benchmark">
      <View className="benchmark__header">
        <Text className="benchmark__title">对标解析</Text>
        <CreditBadge amount={balance} size="md" />
      </View>

      <View className="benchmark__input-section">
        <View className="benchmark__input-wrap">
          <Input
            className="benchmark__input"
            type="text"
            placeholder="粘贴抖音/小红书/B站/快手/微博视频链接"
            value={sourceUrl}
            onInput={(e) => setSourceUrl(e.detail.value)}
            maxlength={500}
          />
          {sourceUrl ? null : (
            <View className="benchmark__paste" onClick={handlePaste}>
              <Text>粘贴</Text>
            </View>
          )}
        </View>
        <View
          className={`benchmark__submit ${submitting ? 'benchmark__submit--loading' : ''}`}
          onClick={handleSubmit}
        >
          <Text>{submitting ? '分析中...' : '开始分析'}</Text>
        </View>
        <Text className="benchmark__hint">支持抖音、小红书、B站、快手、微博等主流平台视频链接</Text>
      </View>

      <View className="benchmark__history">
        <View className="benchmark__history-header">
          <Text className="benchmark__history-title">历史记录</Text>
          <Text className="benchmark__history-refresh" onClick={() => loadHistory()}>
            刷新
          </Text>
        </View>

        {loading ? (
          <LoadingState title="加载历史中..." />
        ) : error ? (
          <ErrorState title="加载失败" onRetry={() => loadHistory()} />
        ) : history.length === 0 ? (
          <EmptyState title="暂无解析记录" description="输入视频链接开始对标分析" />
        ) : (
          <View className="benchmark__list">
            {history.map((item) => {
              const platformMeta = getPlatformMeta(item.platform)
              const statusMeta = getStatusMeta(item.status)
              return (
                <View
                  key={item.id}
                  className="benchmark__item"
                  onClick={() => handleHistoryClick(item)}
                >
                  <View className="benchmark__item-icon">
                    <Text>{platformMeta.icon}</Text>
                  </View>
                  <View className="benchmark__item-body">
                    <Text className="benchmark__item-url">{formatUrl(item.sourceUrl)}</Text>
                    <View className="benchmark__item-meta">
                      <Text className="benchmark__item-platform">{platformMeta.label}</Text>
                      <Text className="benchmark__item-time">{formatTime(item.createdAt)}</Text>
                    </View>
                  </View>
                  <View className={`benchmark__status ${statusMeta.cls}`}>
                    <Text>{statusMeta.label}</Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}
