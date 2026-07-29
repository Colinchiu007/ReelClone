/**
 * NotificationGateway 单元测试
 *
 * 测试覆盖：
 *  - handleConnection: 缺少 token / token 无效 / token 有效 → 加入房间
 *  - handleDisconnect: 仅记录日志
 *  - handlePing: 返回 pong
 *  - pushToUser: 调用 server.to(room).emit(...)
 */
import { JwtService } from '@nestjs/jwt'
import type { Socket } from 'socket.io'
import {
  NotificationGateway,
  userRoom,
} from './ws.gateway'

/** 构造一个 socket mock，仅包含本测试所需字段 */
function createSocketMock(handshakeQuery: Record<string, unknown> = {}): {
  socket: Socket
  emit: jest.Mock
  disconnect: jest.Mock
  join: jest.Mock
} {
  const emit = jest.fn()
  const disconnect = jest.fn()
  const join = jest.fn()
  const socket = {
    id: 'socket-id-1',
    handshake: { query: handshakeQuery, auth: {} },
    data: {},
    emit,
    disconnect,
    join,
  } as unknown as Socket
  return { socket, emit, disconnect, join }
}

describe('NotificationGateway', () => {
  let gateway: NotificationGateway
  let jwtService: jest.Mocked<JwtService>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let serverMock: any

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
      // 其它方法不需要
    } as unknown as jest.Mocked<JwtService>

    gateway = new NotificationGateway(jwtService)

    // 通过反射注入 @WebSocketServer()
    serverMock = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    }
    // gateway.server 是 private，通过 Object.defineProperty 注入
    Object.defineProperty(gateway, 'server', {
      value: serverMock,
      writable: true,
      configurable: true,
    })
  })

  // -------------------- afterInit --------------------

  it('afterInit: 不抛异常', () => {
    expect(() => gateway.afterInit()).not.toThrow()
  })

  // -------------------- handleConnection --------------------

  describe('handleConnection', () => {
    it('缺少 token → emit error + disconnect', () => {
      const { socket, emit, disconnect } = createSocketMock({})
      gateway.handleConnection(socket)

      expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('缺少') }))
      expect(disconnect).toHaveBeenCalledWith(true)
    })

    it('token 无效 → emit error + disconnect', () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid signature')
      })
      const { socket, emit, disconnect } = createSocketMock({ token: 'bad-token' })
      gateway.handleConnection(socket)

      expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('未授权') }))
      expect(disconnect).toHaveBeenCalledWith(true)
    })

    it('token 有效但 payload 无 userId → emit error + disconnect', () => {
      jwtService.verify.mockReturnValueOnce({ foo: 'bar' } as never)
      const { socket, emit, disconnect } = createSocketMock({ token: 'good-token' })
      gateway.handleConnection(socket)

      expect(emit).toHaveBeenCalledWith('error', expect.any(Object))
      expect(disconnect).toHaveBeenCalledWith(true)
    })

    it('token 有效（含 userId） → join user:userId 房间，data.userId 被写入', () => {
      jwtService.verify.mockReturnValueOnce({
        userId: 'user-1',
        openid: 'wx-openid',
      } as never)
      const { socket, join } = createSocketMock({ token: 'good-token' })
      gateway.handleConnection(socket)

      expect(join).toHaveBeenCalledWith(userRoom('user-1'))
      expect((socket.data as { userId: string }).userId).toBe('user-1')
    })

    it('token 有效（payload 用 sub 而非 userId） → 也能正确提取 userId', () => {
      jwtService.verify.mockReturnValueOnce({ sub: 'sub-1' } as never)
      const { socket, join } = createSocketMock({ token: 'good-token' })
      gateway.handleConnection(socket)

      expect(join).toHaveBeenCalledWith(userRoom('sub-1'))
    })

    it('token 是数组形式（query 中重复 token） → 取第一个', () => {
      jwtService.verify.mockReturnValueOnce({ userId: 'user-1' } as never)
      const { socket, join } = createSocketMock({ token: ['good-token', 'extra'] })
      gateway.handleConnection(socket)

      expect(jwtService.verify).toHaveBeenCalledWith('good-token')
      expect(join).toHaveBeenCalledWith(userRoom('user-1'))
    })

    it('token 通过 socket.handshake.auth 提供 → 也能识别', () => {
      jwtService.verify.mockReturnValueOnce({ userId: 'user-1' } as never)
      // query 中没有 token，但 auth 中有
      const socket = {
        id: 's1',
        handshake: { query: {}, auth: { token: 'auth-token' } },
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
        join: jest.fn(),
      } as unknown as Socket
      gateway.handleConnection(socket)

      expect(jwtService.verify).toHaveBeenCalledWith('auth-token')
    })
  })

  // -------------------- handleDisconnect --------------------

  describe('handleDisconnect', () => {
    it('不抛异常，正常记录', () => {
      const socket = {
        id: 's1',
        data: { userId: 'user-1' },
      } as unknown as Socket
      expect(() => gateway.handleDisconnect(socket)).not.toThrow()
    })

    it('data.userId 缺失时也能正常处理', () => {
      const socket = {
        id: 's1',
        data: {},
      } as unknown as Socket
      expect(() => gateway.handleDisconnect(socket)).not.toThrow()
    })
  })

  // -------------------- handlePing --------------------

  describe('handlePing', () => {
    it('收到 ping → 回 pong，带 server ts', () => {
      const before = Date.now()
      const result = gateway.handlePing({ ts: 1000 })
      const after = Date.now()

      expect(result.event).toBe('pong')
      expect(result.data.clientTs).toBe(1000)
      expect(result.data.ts).toBeGreaterThanOrEqual(before)
      expect(result.data.ts).toBeLessThanOrEqual(after)
    })

    it('无 payload 也能回 pong', () => {
      const result = gateway.handlePing(undefined)
      expect(result.event).toBe('pong')
      expect(result.data.clientTs).toBeUndefined()
    })
  })

  // -------------------- pushToUser --------------------

  describe('pushToUser', () => {
    it('调用 server.to(user:userId).emit(event, data)', () => {
      const payload = {
        workId: 'w1',
        progress: 50,
        message: 'halfway',
      }
      gateway.pushToUser('user-1', 'task:progress', payload)

      expect(serverMock.to).toHaveBeenCalledWith(userRoom('user-1'))
      // serverMock.to() 返回的对象有 emit 方法
      const target = serverMock.to()
      expect(target.emit).toHaveBeenCalledWith('task:progress', payload)
    })

    it('不同事件名都能推送', () => {
      gateway.pushToUser('user-1', 'task:completed', { workId: 'w1' })
      gateway.pushToUser('user-1', 'task:failed', { workId: 'w1', message: 'oops' })
      gateway.pushToUser('user-1', 'notification', { notification: { id: 'n1' } })

      expect(serverMock.to).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------- userRoom 工具函数 --------------------

  describe('userRoom', () => {
    it('生成 user:<userId> 格式的房间名', () => {
      expect(userRoom('abc-123')).toBe('user:abc-123')
    })
  })

  // -------------------- Server 未就绪场景 --------------------

  describe('server 未就绪', () => {
    it('server 为 undefined → 不抛异常，仅记录日志', () => {
      // 重新构造 gateway 但不注入 server
      const freshGateway = new NotificationGateway(jwtService)
      // server 字段保持 undefined

      expect(() =>
        freshGateway.pushToUser('u1', 'notification', { foo: 'bar' }),
      ).not.toThrow()
    })
  })
})
