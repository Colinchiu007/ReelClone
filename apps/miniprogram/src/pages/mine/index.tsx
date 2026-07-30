import { useState, useCallback } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { QuickCreate, LoadingState, CreditBadge } from '@/components'
import { getCurrentUser } from '@/services/api/user.api'
import { logout as logoutApi } from '@/services/api/auth.api'
import { getBalance } from '@/services/api/billing.api'
import { listWorks } from '@/services/api/workbench.api'
import { listAssets } from '@/services/api/asset.api'
import { useAuthStore } from '@/stores/auth.store'
import { usePointsStore } from '@/stores/points.store'
import { useNotificationStore } from '@/stores/notification.store'
import { tokenStore } from '@/services/token'
import './index.scss'

interface MenuItem {
  icon: string
  label: string
  path: string
}

const MENU_ITEMS: MenuItem[] = [
  { icon: '📦', label: '我的资产', path: '/pages/asset/index' },
  { icon: '🎬', label: '我的作品', path: '/pages/workbench/works/index' },
  { icon: '📋', label: '我的模板', path: '/pages/template/my-templates/index' },
  { icon: '📤', label: '我的上传', path: '/pages/template/my-uploaded/index' },
  { icon: '💎', label: '我的套餐', path: '/pages/billing/my-package/index' },
  { icon: '📊', label: '消费记录', path: '/pages/billing/transactions/index' },
  { icon: '🧾', label: '我的订单', path: '/pages/billing/orders/index' },
  { icon: '⚙️', label: '设置', path: '/pages/settings/index' },
  { icon: 'ℹ️', label: '关于', path: '/pages/settings/about/index' },
]

interface UserStats {
  works: number
  images: number
  videos: number
}

function maskMobile(mobile: string | null): string {
  if (!mobile) return '未绑定'
  if (mobile.length < 7) return mobile
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`
}

function maskId(id: string): string {
  if (!id) return ''
  if (id.length <= 8) return id
  return `ID: ${id.slice(0, 8)}...`
}

export default function Index() {
  const { user, isAuthenticated, setUser, logout: clearAuthState } = useAuthStore()
  const { setBalance } = usePointsStore()
  const { setUnreadCount } = useNotificationStore()
  const [balance, setBalanceState] = useState(0)
  const [stats, setStats] = useState<UserStats>({ works: 0, images: 0, videos: 0 })
  const [loading, setLoading] = useState(false)
  const [quickVisible, setQuickVisible] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const [freshUser, bal] = await Promise.all([getCurrentUser(), getBalance()])
      setUser(freshUser)
      setBalanceState(bal.balance)
      setBalance({ balance: bal.balance, frozen: bal.frozen, total: bal.total })

      // 并行拉取统计数据
      const [worksRes, imagesRes, videosRes] = await Promise.all([
        listWorks({ pageSize: 1 }),
        listAssets({ pageSize: 1, assetType: 'IMAGE' }),
        listAssets({ pageSize: 1, assetType: 'VIDEO' }),
      ])
      setStats({
        works: worksRes.data.total,
        images: imagesRes.data.total,
        videos: videosRes.data.total,
      })
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }, [setUser, setBalance])

  useLoad(() => {
    if (isAuthenticated) {
      setLoading(true)
      loadProfile()
    }
  })

  useDidShow(() => {
    if (isAuthenticated) {
      getBalance()
        .then((bal) => {
          setBalanceState(bal.balance)
          setBalance({ balance: bal.balance, frozen: bal.frozen, total: bal.total })
        })
        .catch(() => {})
    }
  })

  const handleMenuTap = (item: MenuItem) => {
    if (!isAuthenticated) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: item.path })
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '确认退出',
      content: '退出后需要重新登录才能使用',
      confirmText: '退出',
      cancelText: '取消',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (res.confirm) {
          try {
            await logoutApi()
          } catch {
            // 即使 API 失败也继续清空本地状态
          } finally {
            tokenStore.clear()
            clearAuthState()
            setBalance({ balance: 0, frozen: 0, total: 0 })
            setUnreadCount(0)
            setStats({ works: 0, images: 0, videos: 0 })
            setBalanceState(0)
            Taro.showToast({ title: '已退出登录', icon: 'success', duration: 1500 })
            setTimeout(() => {
              Taro.switchTab({ url: '/pages/home/index' })
            }, 1000)
          }
        }
      },
    })
  }

  const handleAvatarTap = () => {
    if (!isAuthenticated) {
      Taro.showToast({ title: '请通过微信登录', icon: 'none' })
    }
  }

  const statItems = [
    { label: '作品', value: stats.works },
    { label: '图片', value: stats.images },
    { label: '视频', value: stats.videos },
    { label: '积分', value: balance },
  ]

  return (
    <View className="mine">
      <View className="mine__user-card">
        <View className="mine__user-info" onClick={handleAvatarTap}>
          <View className="mine__avatar">
            {user?.avatarUrl ? (
              <Image className="mine__avatar-img" src={user.avatarUrl} mode="aspectFill" />
            ) : (
              <View className="mine__avatar-placeholder">
                <Text>{user?.nickname?.[0] || '👤'}</Text>
              </View>
            )}
          </View>
          <View className="mine__user-detail">
            <Text className="mine__nickname">
              {user?.nickname || (isAuthenticated ? '用户' : '未登录')}
            </Text>
            {isAuthenticated && user ? (
              <View className="mine__user-meta">
                <Text className="mine__user-id">{maskId(user.id)}</Text>
                <View
                  className={`mine__mobile-badge ${user.mobile ? 'mine__mobile-badge--on' : ''}`}
                >
                  <Text>{user.mobile ? maskMobile(user.mobile) : '未绑定手机号'}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View className="mine__stats">
          {statItems.map((item) => (
            <View key={item.label} className="mine__stat-item">
              <Text className="mine__stat-value">
                {item.label === '积分' ? <CreditBadge amount={item.value} size="sm" /> : item.value}
              </Text>
              <Text className="mine__stat-label">{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {loading && <LoadingState title="加载中..." />}

      <View className="mine__menu">
        {MENU_ITEMS.map((item) => (
          <View key={item.label} className="mine__menu-item" onClick={() => handleMenuTap(item)}>
            <View className="mine__menu-icon">
              <Text>{item.icon}</Text>
            </View>
            <Text className="mine__menu-label">{item.label}</Text>
            <Text className="mine__menu-arrow">›</Text>
          </View>
        ))}
      </View>

      {isAuthenticated && (
        <View className="mine__logout" onClick={handleLogout}>
          <Text>退出登录</Text>
        </View>
      )}

      <View className="mine__fab" onClick={() => setQuickVisible(true)}>
        <Text className="mine__fab-icon">+</Text>
      </View>

      <QuickCreate visible={quickVisible} onClose={() => setQuickVisible(false)} />
    </View>
  )
}
