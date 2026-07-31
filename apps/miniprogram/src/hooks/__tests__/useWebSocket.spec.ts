/**
 * @jest-environment jsdom
 *
 * useWebSocket Hook 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（connected=false）
 *  - 连接建立：无 token 不连接 / 有 token 连接 / URL 含 token
 *  - onOpen 回调：connected=true / 重置重连计数 / 启动心跳
 *  - onMessage 事件分发：JSON 含 event / 无 event / 非 JSON / 多 handler
 *  - onClose 回调：connected=false / 停止心跳 / 非手动关闭触发重连
 *  - onError 回调：connected=false / 停止心跳
 *  - 心跳机制：每 30s 发送 ping
 *  - 指数退避重连：1s → 2s → 4s → ... → 最大 30s
 *  - 手动关闭（卸载）：不触发重连
 *  - 订阅管理：subscribe / unsubscribe
 */
import Taro from '@tarojs/taro'
import { __resetAll } from '../../../__mocks__/taro'
import { renderHook, act } from '../../test/renderHook'
import { useWebSocket } from '../useWebSocket'

/** mock tokenStore —— 仅需要 getAccessToken */
jest.mock('@/services/token', () => ({
  tokenStore: {
    getAccessToken: jest.fn(),
  },
}))

import { tokenStore } from '@/services/token'

/** WebSocket 事件类型（与源码一致） */
type WsEvent = 'task:progress' | 'task:completed' | 'task:failed' | 'notification'

/**
 * 创建 mock SocketTask，捕获 onOpen/onMessage/onClose/onError 回调
 * 模拟 Taro.connectSocket 返回的 SocketTask 接口
 */
function createMockSocketTask() {
  const handlers: {
    open?: () => void
    message?: (res: { data: string }) => void
    close?: () => void
    error?: () => void
  } = {}

  const socket = {
    onOpen: jest.fn((cb: () => void) => {
      handlers.open = cb
    }),
    onMessage: jest.fn((cb: (res: { data: string }) => void) => {
      handlers.message = cb
    }),
    onClose: jest.fn((cb: () => void) => {
      handlers.close = cb
    }),
    onError: jest.fn((cb: () => void) => {
      handlers.error = cb
    }),
    send: jest.fn(),
    close: jest.fn(),
  }

  return { socket, handlers }
}

/** 在 fake timers 下推进微任务（让 await Taro.connectSocket() resolve） */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useWebSocket', () => {
  let mockSocket: ReturnType<typeof createMockSocketTask>

  beforeEach(() => {
    __resetAll()
    mockSocket = createMockSocketTask()
    ;(Taro.connectSocket as jest.Mock).mockResolvedValue(mockSocket.socket)
    ;(tokenStore.getAccessToken as jest.Mock).mockReturnValue('test-token')
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('初始状态', () => {
    it('connected 应为 false', () => {
      const { result } = renderHook(() => useWebSocket())
      expect(result.current.connected).toBe(false)
    })

    it('应暴露 subscribe / unsubscribe 方法', () => {
      const { result } = renderHook(() => useWebSocket())
      expect(typeof result.current.subscribe).toBe('function')
      expect(typeof result.current.unsubscribe).toBe('function')
    })
  })

  describe('连接建立', () => {
    it('有 token 时应调用 connectSocket 且 URL 含 token', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      expect(Taro.connectSocket).toHaveBeenCalledTimes(1)
      expect(Taro.connectSocket).toHaveBeenCalledWith({
        url: 'ws://localhost:3008/ws?token=test-token',
        header: { 'content-type': 'application/json' },
      })
    })

    it('无 token 时不应调用 connectSocket', async () => {
      ;(tokenStore.getAccessToken as jest.Mock).mockReturnValue(null)

      renderHook(() => useWebSocket())
      await flushMicrotasks()

      expect(Taro.connectSocket).not.toHaveBeenCalled()
    })

    it('空字符串 token 视为无 token', async () => {
      ;(tokenStore.getAccessToken as jest.Mock).mockReturnValue('')

      renderHook(() => useWebSocket())
      await flushMicrotasks()

      expect(Taro.connectSocket).not.toHaveBeenCalled()
    })
  })

  describe('onOpen 回调', () => {
    it('onOpen 时 connected 应变为 true', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => {
        mockSocket.handlers.open?.()
      })

      expect(result.current.connected).toBe(true)
    })

    it('onOpen 时应重置重连计数（重连后再 onOpen 不再指数增长）', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      // 第一次连接 onOpen
      act(() => mockSocket.handlers.open?.())

      // 模拟 close 触发重连
      const socket2 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket2.socket)

      act(() => mockSocket.handlers.close?.())
      // 推进 1s 触发重连
      act(() => {
        jest.advanceTimersByTime(1000)
      })
      await flushMicrotasks()

      // 第二次连接 onOpen（此时重连计数应被重置）
      act(() => socket2.handlers.open?.())

      // 再次 close，应该还是 1s（而非 2s）
      const socket3 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket3.socket)

      act(() => socket2.handlers.close?.())
      act(() => {
        jest.advanceTimersByTime(1000)
      })
      await flushMicrotasks()

      expect(Taro.connectSocket).toHaveBeenCalledTimes(3)
    })
  })

  describe('心跳机制', () => {
    it('onOpen 后每 30s 发送一次 ping', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      // 还未到 30s，未发送心跳
      expect(mockSocket.socket.send).not.toHaveBeenCalled()

      // 快进 30s
      act(() => {
        jest.advanceTimersByTime(30000)
      })

      expect(mockSocket.socket.send).toHaveBeenCalledTimes(1)
      // 验证 send 调用参数：解析 data 字段验证结构
      const sendCall = (mockSocket.socket.send as jest.Mock).mock.calls[0][0]
      const parsed = JSON.parse(sendCall.data)
      expect(parsed.event).toBe('ping')
      expect(typeof parsed.data.ts).toBe('number')
    })

    it('连续多个 30s 应多次发送 ping', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      act(() => jest.advanceTimersByTime(90000))

      expect(mockSocket.socket.send).toHaveBeenCalledTimes(3)
    })

    it('onClose 时应停止心跳', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      act(() => mockSocket.handlers.close?.())

      // 快进 60s，不应再发送心跳
      act(() => {
        jest.advanceTimersByTime(60000)
      })

      expect(mockSocket.socket.send).not.toHaveBeenCalled()
    })

    it('onError 时应停止心跳', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      act(() => mockSocket.handlers.error?.())

      act(() => {
        jest.advanceTimersByTime(60000)
      })

      expect(mockSocket.socket.send).not.toHaveBeenCalled()
    })
  })

  describe('onMessage 事件分发', () => {
    it('收到 JSON 含 event 字段时应调用订阅的 handler', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler)
      })

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ event: 'task:progress', data: { percent: 50 } }),
        })
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ percent: 50 })
    })

    it('同一事件多个 handler 都应被调用', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler1 = jest.fn()
      const handler2 = jest.fn()
      act(() => {
        result.current.subscribe('task:completed', handler1)
        result.current.subscribe('task:completed', handler2)
      })

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ event: 'task:completed', data: { id: 'task-1' } }),
        })
      })

      expect(handler1).toHaveBeenCalledWith({ id: 'task-1' })
      expect(handler2).toHaveBeenCalledWith({ id: 'task-1' })
    })

    it('收到其他 event 不应调用未订阅的 handler', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler)
      })

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ event: 'notification', data: { msg: 'hello' } }),
        })
      })

      expect(handler).not.toHaveBeenCalled()
    })

    it('JSON 无 event 字段时不应调用任何 handler', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler)
      })

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ foo: 'bar' }),
        })
      })

      expect(handler).not.toHaveBeenCalled()
    })

    it('非 JSON 消息应被忽略（不抛错）', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler)
      })

      expect(() => {
        act(() => {
          mockSocket.handlers.message?.({ data: 'not-json-pong' })
        })
      }).not.toThrow()

      expect(handler).not.toHaveBeenCalled()
    })

    it('支持所有四种事件类型', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const events: WsEvent[] = ['task:progress', 'task:completed', 'task:failed', 'notification']
      const handlers: Record<string, jest.Mock> = {}

      act(() => {
        events.forEach((evt) => {
          handlers[evt] = jest.fn()
          result.current.subscribe(evt, handlers[evt])
        })
      })

      events.forEach((evt) => {
        act(() => {
          mockSocket.handlers.message?.({
            data: JSON.stringify({ event: evt, data: { type: evt } }),
          })
        })
      })

      events.forEach((evt) => {
        expect(handlers[evt]).toHaveBeenCalledTimes(1)
        expect(handlers[evt]).toHaveBeenCalledWith({ type: evt })
      })
    })
  })

  describe('onClose 回调', () => {
    it('onClose 时 connected 应变为 false', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())
      expect(result.current.connected).toBe(true)

      act(() => mockSocket.handlers.close?.())
      expect(result.current.connected).toBe(false)
    })

    it('onClose 非手动关闭时应触发重连（1s 后）', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      // 准备第二次连接的 socket
      const socket2 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket2.socket)

      act(() => mockSocket.handlers.close?.())

      // 还未到重连时间
      expect(Taro.connectSocket).toHaveBeenCalledTimes(1)

      // 快进 1s 触发重连
      act(() => {
        jest.advanceTimersByTime(1000)
      })
      await flushMicrotasks()

      expect(Taro.connectSocket).toHaveBeenCalledTimes(2)
    })

    it('onClose 应清除 socketRef', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())
      act(() => mockSocket.handlers.close?.())

      // 快进时间验证不发送心跳（socketRef 已清除）
      act(() => {
        jest.advanceTimersByTime(60000)
      })

      expect(mockSocket.socket.send).not.toHaveBeenCalled()
    })
  })

  describe('onError 回调', () => {
    it('onError 时 connected 应变为 false', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())
      expect(result.current.connected).toBe(true)

      act(() => mockSocket.handlers.error?.())
      expect(result.current.connected).toBe(false)
    })
  })

  describe('指数退避重连', () => {
    it('连续 close 不 onOpen 时重连延迟应指数增长：1s → 2s → 4s', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      // 不调用 onOpen，直接 close（模拟连接建立后立即断开，未触发 onOpen）
      // 此时 reconnectCount 保持递增：0→1→2→3
      // 延迟序列：1s, 2s, 4s

      // 第一次 close：delay=1s (2^0 * 1000), count 0→1
      act(() => mockSocket.handlers.close?.())

      // 快进 999ms，不应重连
      act(() => jest.advanceTimersByTime(999))
      expect(Taro.connectSocket).toHaveBeenCalledTimes(1)

      // 快进到 1000ms，触发第一次重连
      const socket2 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket2.socket)
      act(() => jest.advanceTimersByTime(1))
      await flushMicrotasks() // 让 connect resolve + 注册 onClose
      expect(Taro.connectSocket).toHaveBeenCalledTimes(2)

      // 第二次 close：delay=2s (2^1 * 1000), count 1→2
      act(() => socket2.handlers.close?.())

      // 快进 1999ms，不应重连
      act(() => jest.advanceTimersByTime(1999))
      expect(Taro.connectSocket).toHaveBeenCalledTimes(2)

      // 快进到 2000ms，触发第二次重连
      const socket3 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket3.socket)
      act(() => jest.advanceTimersByTime(1))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(3)

      // 第三次 close：delay=4s (2^2 * 1000), count 2→3
      act(() => socket3.handlers.close?.())

      // 快进 3999ms，不应重连
      act(() => jest.advanceTimersByTime(3999))
      expect(Taro.connectSocket).toHaveBeenCalledTimes(3)

      // 快进到 4000ms，触发第三次重连
      const socket4 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket4.socket)
      act(() => jest.advanceTimersByTime(1))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(4)
    })

    it('重连延迟最大为 30s（不超过 MAX_RECONNECT_DELAY）', async () => {
      renderHook(() => useWebSocket())
      await flushMicrotasks()

      // 连续 5 次 close（不 onOpen），延迟序列：1s, 2s, 4s, 8s, 16s, 32s→cap 30s
      // count: 0→1→2→3→4→5

      // 第 1 次 close：delay=1s
      act(() => mockSocket.handlers.close?.())
      const socket2 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket2.socket)
      act(() => jest.advanceTimersByTime(1000))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(2)

      // 第 2 次 close：delay=2s
      act(() => socket2.handlers.close?.())
      const socket3 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket3.socket)
      act(() => jest.advanceTimersByTime(2000))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(3)

      // 第 3 次 close：delay=4s
      act(() => socket3.handlers.close?.())
      const socket4 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket4.socket)
      act(() => jest.advanceTimersByTime(4000))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(4)

      // 第 4 次 close：delay=8s
      act(() => socket4.handlers.close?.())
      const socket5 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket5.socket)
      act(() => jest.advanceTimersByTime(8000))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(5)

      // 第 5 次 close：delay=16s
      act(() => socket5.handlers.close?.())
      const socket6 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket6.socket)
      act(() => jest.advanceTimersByTime(16000))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(6)

      // 第 6 次 close：delay=32s，被 cap 到 30s
      act(() => socket6.handlers.close?.())
      const socket7 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket7.socket)

      // 快进 29999ms，不应重连
      act(() => jest.advanceTimersByTime(29999))
      expect(Taro.connectSocket).toHaveBeenCalledTimes(6)

      // 快进到 30000ms，触发第 7 次重连
      act(() => jest.advanceTimersByTime(1))
      await flushMicrotasks()
      expect(Taro.connectSocket).toHaveBeenCalledTimes(7)
    })
  })

  describe('手动关闭（卸载）', () => {
    it('卸载时应调用 socket.close', async () => {
      const { unmount } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      unmount()

      expect(mockSocket.socket.close).toHaveBeenCalled()
    })

    it('卸载后 onClose 不应触发重连', async () => {
      const { unmount } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      unmount()

      // 手动触发 onClose（模拟 socket.close 的回调）
      act(() => mockSocket.handlers.close?.())

      // 快进很长时间，不应重连
      act(() => {
        jest.advanceTimersByTime(60000)
      })

      expect(Taro.connectSocket).toHaveBeenCalledTimes(1)
    })

    it('卸载时应清除重连定时器', async () => {
      const { unmount } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      // 触发 close 启动重连定时器
      const socket2 = createMockSocketTask()
      ;(Taro.connectSocket as jest.Mock).mockResolvedValue(socket2.socket)
      act(() => mockSocket.handlers.close?.())

      // 立即卸载（重连定时器还未触发）
      unmount()

      // 快进 1s，不应触发重连
      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(Taro.connectSocket).toHaveBeenCalledTimes(1)
    })
  })

  describe('订阅管理', () => {
    it('unsubscribe 后不再调用 handler', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler)
        result.current.unsubscribe('task:progress', handler)
      })

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ event: 'task:progress', data: {} }),
        })
      })

      expect(handler).not.toHaveBeenCalled()
    })

    it('unsubscribe 未订阅的 handler 不应报错', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler = jest.fn()
      expect(() => {
        act(() => {
          result.current.unsubscribe('task:progress', handler)
        })
      }).not.toThrow()
    })

    it('unsubscribe 一个 handler 不影响同事件的其他 handler', async () => {
      const { result } = renderHook(() => useWebSocket())
      await flushMicrotasks()

      act(() => mockSocket.handlers.open?.())

      const handler1 = jest.fn()
      const handler2 = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler1)
        result.current.subscribe('task:progress', handler2)
        result.current.unsubscribe('task:progress', handler1)
      })

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ event: 'task:progress', data: { p: 1 } }),
        })
      })

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledWith({ p: 1 })
    })

    it('订阅可在连接前调用（listenersRef 持久化）', async () => {
      const { result } = renderHook(() => useWebSocket())
      // 不等待 flushMicrotasks，在连接前订阅
      const handler = jest.fn()
      act(() => {
        result.current.subscribe('task:progress', handler)
      })

      await flushMicrotasks()
      act(() => mockSocket.handlers.open?.())

      act(() => {
        mockSocket.handlers.message?.({
          data: JSON.stringify({ event: 'task:progress', data: { early: true } }),
        })
      })

      expect(handler).toHaveBeenCalledWith({ early: true })
    })
  })

  describe('Hook 稳定性', () => {
    it('多次渲染 subscribe/unsubscribe 引用应稳定（useCallback 空依赖）', () => {
      const { result, rerender } = renderHook(() => useWebSocket())
      const subscribe1 = result.current.subscribe
      const unsubscribe1 = result.current.unsubscribe

      rerender()

      expect(result.current.subscribe).toBe(subscribe1)
      expect(result.current.unsubscribe).toBe(unsubscribe1)
    })
  })
})
