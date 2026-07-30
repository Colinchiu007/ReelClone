/**
 * 灵感广场页（template 分包）
 * 对应 FR4 - 灵感广场与行业偏好绑定
 *
 * 功能：
 *  - 顶部搜索栏（输入框 + 搜索按钮，500ms 防抖）
 *  - 平台筛选 Tab：全部 / 抖音 / 小红书 / B站 / 视频号
 *  - 排序栏：我的行业（按用户行业筛选）/ 热度 / 最近一周
 *  - 双列瀑布流（TemplateCard）
 *  - 首次进入自动唤起行业偏好弹窗
 *  - 收藏切换：乐观更新 + 失败回滚
 *  - 上拉加载更多（useReachBottom）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useReachBottom } from '@tarojs/taro'
import { TemplateCard, EmptyState, LoadingState, ErrorState } from '@/components'
import IndustryModal from '../industry-modal'
import {
  favoriteTemplate,
  getIndustryPreferences,
  listTemplates,
  unfavoriteTemplate,
} from '@/services/api/template.api'
import type { Template } from '@/types'
import './index.scss'

/** 平台 Tab（key 与后端 platform 枚举对齐） */
const PLATFORM_TABS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'DOUYIN', label: '抖音' },
  { key: 'XIAOHONGSHU', label: '小红书' },
  { key: 'BILIBILI', label: 'B站' },
  { key: 'WECHAT_VIDEO', label: '视频号' },
]

/** 排序/筛选 Tab */
type SortKey = 'industry' | 'heat' | 'latest'
const SORT_TABS: Array<{ key: SortKey; label: string }> = [
  { key: 'industry', label: '我的行业' },
  { key: 'heat', label: '热度' },
  { key: 'latest', label: '最近一周' },
]

const PAGE_SIZE = 20
const DEBOUNCE_MS = 500

/** 列表项类型：在 Template 上叠加客户端收藏态 */
interface GalleryItem extends Template {
  isFavorited?: boolean
}

export default function GalleryPage() {
  // 筛选/排序/搜索
  const [platform, setPlatform] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('heat')
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')

  // 列表数据
  const [list, setList] = useState<GalleryItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(false)

  // 行业偏好
  const [industries, setIndustries] = useState<string[]>([])
  const [showIndustryModal, setShowIndustryModal] = useState(false)
  // 是否允许通过遮罩关闭弹窗（首次未设置时强制选择）
  const [modalClosable, setModalClosable] = useState(true)
  const [preferencesFetched, setPreferencesFetched] = useState(false)

  // 用 ref 保存最新 industries，避免 fetchList 闭包捕获旧值
  const industriesRef = useRef<string[]>([])
  industriesRef.current = industries

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [keyword])

  // 首次进入：检查行业偏好
  useEffect(() => {
    getIndustryPreferences()
      .then((res) => {
        const arr = Array.isArray(res) ? res : []
        setIndustries(arr)
        // 未设置时弹窗强制选择
        if (arr.length === 0) {
          setModalClosable(false)
          setShowIndustryModal(true)
        }
      })
      .catch(() => {
        // 未登录或接口异常：静默处理，不打断浏览
      })
      .finally(() => setPreferencesFetched(true))
  }, [])

  /** 拉取列表数据 */
  const fetchList = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (replace) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      setError(false)
      try {
        const params: Record<string, unknown> = {
          page: pageNum,
          pageSize: PAGE_SIZE,
          sortBy: sortBy === 'industry' ? 'heat' : sortBy,
        }
        if (platform) params.platform = platform
        if (debouncedKeyword) params.keyword = debouncedKeyword
        if (sortBy === 'industry' && industriesRef.current.length > 0) {
          params.industry = industriesRef.current[0]
        }
        const res = await listTemplates(params)
        const items = (res?.data?.list || []) as GalleryItem[]
        setList((prev) => (replace ? items : [...prev, ...items]))
        setHasMore(items.length >= PAGE_SIZE)
        setPage(pageNum)
      } catch (err) {
        setError(true)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [sortBy, platform, debouncedKeyword],
  )

  // 筛选条件变化时重置到第 1 页
  useEffect(() => {
    if (!preferencesFetched) return
    fetchList(1, true)
  }, [platform, sortBy, debouncedKeyword, preferencesFetched])

  // 上拉加载更多
  useReachBottom(() => {
    if (!loading && !loadingMore && hasMore && !error) {
      fetchList(page + 1, false)
    }
  })

  /** 收藏切换：乐观更新 + 失败回滚 */
  const handleFavorite = useCallback(
    async (id: string, next: boolean) => {
      const snapshot = list
      setList((prev) => prev.map((t) => (t.id === id ? { ...t, isFavorited: next } : t)))
      try {
        if (next) await favoriteTemplate(id)
        else await unfavoriteTemplate(id)
      } catch (err) {
        setList(snapshot)
        Taro.showToast({ title: '操作失败，已回滚', icon: 'none' })
      }
    },
    [list],
  )

  /** 卡片点击 → 模板详情 */
  const handleCardClick = useCallback((id: string) => {
    Taro.navigateTo({ url: `/pages/template/detail/index?templateId=${id}` })
  }, [])

  /** 点击上传者头像 → 跳转公开用户主页（MVP 仅 toast 提示，后续迭代） */
  const handleAuthorClick = useCallback((authorId: string) => {
    Taro.showToast({
      title: `查看用户主页: ${authorId.slice(0, 8)}...`,
      icon: 'none',
      duration: 1500,
    })
    // TODO: P2 迭代时跳转独立用户主页页
    // Taro.navigateTo({ url: `/pages/user/profile/index?userId=${authorId}` });
  }, [])

  /** 点击上传按钮 → 跳转上传视频转模板页 */
  const handleUpload = useCallback(() => {
    Taro.navigateTo({ url: '/pages/template/upload/index' })
  }, [])

  /** 主动唤起行业偏好弹窗（closable=true） */
  const handleOpenIndustryModal = () => {
    setModalClosable(true)
    setShowIndustryModal(true)
  }

  /** 弹窗保存成功：更新本地行业 + 触发列表刷新 */
  const handleIndustrySaved = (next: string[]) => {
    setIndustries(next)
    // 若当前为"我的行业"模式，则刷新列表；否则切换到"我的行业"模式
    if (sortBy !== 'industry') {
      setSortBy('industry')
    } else {
      fetchList(1, true)
    }
  }

  /** 点击搜索按钮：立即同步关键词（绕过防抖） */
  const handleSearchClick = () => {
    setDebouncedKeyword(keyword.trim())
  }

  // 瀑布流双列：按奇偶下标分配到左右列
  const leftColumn = list.filter((_, i) => i % 2 === 0)
  const rightColumn = list.filter((_, i) => i % 2 === 1)

  const renderCard = (t: GalleryItem) => (
    <View key={t.id} className="gallery__item">
      <TemplateCard
        template={{
          id: t.id,
          title: t.title,
          coverUrl: t.coverUrl,
          platform: t.platform,
          author: t.author,
          authorId: t.authorId,
          authorAvatar: t.authorAvatar,
          authorUploadCount: t.authorUploadCount,
          authorUsedCount: t.authorUsedCount,
          playCount: t.playCount,
          iqScore: t.iqScore,
          isFavorited: t.isFavorited,
        }}
        onClick={handleCardClick}
        onFavorite={handleFavorite}
        onAuthorClick={handleAuthorClick}
      />
    </View>
  )

  return (
    <View className="gallery">
      {/* -------------------- 顶部：搜索 + 平台 Tab -------------------- */}
      <View className="gallery__header">
        <View className="gallery__search">
          <Input
            className="gallery__search-input"
            placeholder="搜索灵感模板、关键词..."
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={handleSearchClick}
            confirmType="search"
            maxlength={50}
          />
          <View className="gallery__search-btn" onClick={handleSearchClick}>
            <Text>搜索</Text>
          </View>
        </View>
        <ScrollView className="gallery__platforms" scrollX showScrollbar={false}>
          {PLATFORM_TABS.map((tab) => (
            <View
              key={tab.key || 'all'}
              className={`gallery__platform ${platform === tab.key ? 'gallery__platform--on' : ''}`}
              onClick={() => setPlatform(tab.key)}
            >
              <Text>{tab.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* -------------------- 排序栏 -------------------- */}
      <View className="gallery__sortbar">
        <View className="gallery__sort-tabs">
          {SORT_TABS.map((tab) => (
            <View
              key={tab.key}
              className={`gallery__sort ${sortBy === tab.key ? 'gallery__sort--on' : ''}`}
              onClick={() => setSortBy(tab.key)}
            >
              <Text>{tab.label}</Text>
            </View>
          ))}
        </View>
        <View className="gallery__sortbar-actions">
          <View className="gallery__sortbar-action" onClick={handleUpload}>
            <Text>+ 上传模板</Text>
          </View>
          <View className="gallery__sortbar-action" onClick={handleOpenIndustryModal}>
            <Text>管理行业</Text>
          </View>
        </View>
      </View>

      {/* -------------------- 列表区 -------------------- */}
      <View className="gallery__list">
        {loading && list.length === 0 ? (
          <LoadingState />
        ) : error && list.length === 0 ? (
          <ErrorState onRetry={() => fetchList(1, true)} />
        ) : list.length === 0 ? (
          <EmptyState title="暂无模板" description="换一个筛选条件或关键词试试" icon="🎬" />
        ) : (
          <View className="gallery__waterfall">
            <View className="gallery__col">{leftColumn.map(renderCard)}</View>
            <View className="gallery__col">{rightColumn.map(renderCard)}</View>
          </View>
        )}

        {/* 加载更多 / 到底提示 */}
        {loadingMore ? (
          <View className="gallery__status">
            <Text>加载中...</Text>
          </View>
        ) : null}
        {!loadingMore && !hasMore && list.length > 0 ? (
          <View className="gallery__status">
            <Text>已经到底啦</Text>
          </View>
        ) : null}
      </View>

      {/* -------------------- 行业偏好弹窗 -------------------- */}
      <IndustryModal
        visible={showIndustryModal}
        initialIndustries={industries}
        closable={modalClosable}
        onClose={() => setShowIndustryModal(false)}
        onSaved={handleIndustrySaved}
      />
    </View>
  )
}
