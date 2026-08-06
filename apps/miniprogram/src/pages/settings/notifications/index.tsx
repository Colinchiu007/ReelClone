import { useCallback, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { EmptyState, ErrorState, LoadingState } from '@/components'
import { listNotifications, markAllAsRead, markAsRead } from '@/services/api/notification.api'
import { useNotificationStore } from '@/stores/notification.store'
import type { Notification } from '@/types'
import './index.scss'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const [list, setList] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const decrement = useNotificationStore((state) => state.decrement)
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await listNotifications({ page: 1, pageSize: PAGE_SIZE })
      setList(result.data.list)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
      Taro.stopPullDownRefresh()
    }
  }, [])

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: '通知中心' })
    loadNotifications()
  })

  usePullDownRefresh(() => {
    setRefreshing(true)
    loadNotifications()
  })

  const handleRead = async (notification: Notification) => {
    if (notification.isRead) return
    try {
      await markAsRead(notification.id)
      setList((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true } : item))
      decrement()
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const handleReadAll = async () => {
    if (!list.some((item) => !item.isRead)) return
    try {
      await markAllAsRead()
      setList((items) => items.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  return (
    <View className='notifications-page'>
      <View className='notifications-page__header'>
        <Text className='notifications-page__title'>通知中心</Text>
        <Text className='notifications-page__read-all' onClick={handleReadAll}>全部已读</Text>
      </View>
      {loading || refreshing ? <LoadingState title='加载中...' /> : error ? (
        <ErrorState title='加载失败' onRetry={loadNotifications} />
      ) : list.length === 0 ? (
        <EmptyState title='暂无通知' description='新的消息会显示在这里' />
      ) : (
        <ScrollView className='notifications-page__scroll' scrollY>
          {list.map((notification) => (
            <View
              key={notification.id}
              className={`notification-item ${notification.isRead ? 'notification-item--read' : ''}`}
              onClick={() => handleRead(notification)}
            >
              <View className='notification-item__head'>
                <Text className='notification-item__title'>{notification.title}</Text>
                {!notification.isRead ? <View className='notification-item__dot' /> : null}
              </View>
              <Text className='notification-item__content'>{notification.content}</Text>
              <Text className='notification-item__time'>{notification.createdAt}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
