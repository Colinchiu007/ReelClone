/**
 * useWebSocket —— WebSocket Hook（任务进度推送）
 *
 * 功能：
 *  1. 连接配置的 WebSocket 服务，使用 Taro.connectSocket
 *  2. 自动重连（指数退避：1s → 2s → 4s → ... → 最大 30s）
 *  3. 心跳（每 30s 发送 ping，服务端回 pong）
 *  4. 事件订阅：task:progress / task:completed / task:failed / notification
 *
 * 用法：
 *   const { connected, subscribe, unsubscribe } = useWebSocket()
 *   useEffect(() => {
 *     const handler = (data) => { ... }
 *     subscribe('task:progress', handler)
 *     return () => unsubscribe('task:progress', handler)
 *   }, [])
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { tokenStore } from '@/services/token'

/** WebSocket 推送事件类型 */
type WsEvent = 'task:progress' | 'task:completed' | 'task:failed' | 'notification'

/** 事件处理函数 */
type EventHandler = (data: unknown) => void

declare const WS_BASE_URL: string | undefined

const websocketBaseUrl =
  typeof WS_BASE_URL === 'undefined' || !WS_BASE_URL ? 'wss://api.reelclone.com' : WS_BASE_URL

/** 心跳间隔（30s） */
const HEARTBEAT_INTERVAL = 30000

/** 最大重连延迟（30s） */
const MAX_RECONNECT_DELAY = 30000

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Taro.SocketTask | null>(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const manualCloseRef = useRef(false)
  const listenersRef = useRef<Map<WsEvent, Set<EventHandler>>>(new Map())

  /** 启动心跳定时器 */
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
    }
    heartbeatTimerRef.current = setInterval(() => {
      const socket = socketRef.current
      if (socket) {
        socket.send({ data: JSON.stringify({ event: 'ping', data: { ts: Date.now() } }) })
      }
    }, HEARTBEAT_INTERVAL)
  }, [])

  /** 停止心跳 */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  /** 建立连接 */
  const connect = useCallback(async () => {
    const token = tokenStore.getAccessToken()
    if (!token) return

    manualCloseRef.current = false

    const socket = await Taro.connectSocket({
      url: `${websocketBaseUrl}/ws?token=${token}`,
      header: { 'content-type': 'application/json' },
    })
    socketRef.current = socket

    socket.onOpen(() => {
      setConnected(true)
      reconnectCountRef.current = 0
      startHeartbeat()
    })

    socket.onMessage((res) => {
      try {
        const parsed = JSON.parse(res.data as string) as { event?: WsEvent; data?: unknown }
        if (parsed.event) {
          const handlers = listenersRef.current.get(parsed.event)
          if (handlers) {
            handlers.forEach((h) => h(parsed.data))
          }
        }
      } catch {
        // 非 JSON 消息（如 pong），忽略
      }
    })

    socket.onClose(() => {
      setConnected(false)
      stopHeartbeat()
      socketRef.current = null
      if (!manualCloseRef.current) {
        scheduleReconnect()
      }
    })

    socket.onError(() => {
      setConnected(false)
      stopHeartbeat()
    })
  }, [startHeartbeat, stopHeartbeat])

  /** 指数退避重连 */
  const scheduleReconnect = useCallback(() => {
    if (manualCloseRef.current) return
    const delay = Math.min(1000 * 2 ** reconnectCountRef.current, MAX_RECONNECT_DELAY)
    reconnectCountRef.current++
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }
    reconnectTimerRef.current = setTimeout(() => {
      connect()
    }, delay)
  }, [connect])

  /** 订阅事件 */
  const subscribe = useCallback((event: WsEvent, handler: EventHandler) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set())
    }
    listenersRef.current.get(event)!.add(handler)
  }, [])

  /** 取消订阅事件 */
  const unsubscribe = useCallback((event: WsEvent, handler: EventHandler) => {
    listenersRef.current.get(event)?.delete(handler)
  }, [])

  // 组件挂载时连接，卸载时断开
  useEffect(() => {
    connect()
    return () => {
      manualCloseRef.current = true
      stopHeartbeat()
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      socketRef.current?.close({})
      socketRef.current = null
    }
  }, [connect, stopHeartbeat])

  return { connected, subscribe, unsubscribe }
}
