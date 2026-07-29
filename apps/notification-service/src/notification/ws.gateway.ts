/**
 * 通知 WebSocket 网关
 *
 * 协议：
 *  - 路径：/ws?token=<jwt>
 *  - 鉴权：从 query.token 解析 JWT，验证后将 socket 加入房间 `user:{userId}`
 *  - 推送事件：task:progress / task:completed / task:failed / notification
 *  - 心跳：客户端发 `ping`，服务端回 `pong`（依赖 socket.io 内置心跳也可，
 *          保留显式 ping/pong 便于小程序端弱网环境下主动探测）
 *
 * 实现：
 *  - 使用 @nestjs/websockets + @nestjs/platform-socket.io
 *  - 鉴权在 handleConnection 中手动执行，验证失败直接 socket.disconnect(true)
 *  - 推送通过 this.server.to(`user:${userId}`).emit(...) 触发，
 *    多实例部署时同一用户的连接会分散在不同实例，需要适配器（socket.io-redis）
 *    才能跨实例广播——本服务 MVP 阶段单实例，留 TODO
 */
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Inject } from '@nestjs/common'
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import type { CurrentUserPayload } from '@reelclone/common'
import type { Redis } from 'ioredis'
import { REDIS_CLIENT } from '@reelclone/database'

/** WebSocket 推送事件名 */
export type WsPushEvent = 'task:progress' | 'task:completed' | 'task:failed' | 'notification'

/** WebSocket 路径 */
export const WS_PATH = '/ws'

/** 房间名前缀：user:<userId> */
export function userRoom(userId: string): string {
  return `user:${userId}`
}

/**
 * WebSocket 网关
 *
 * - namespace 默认 '/'
 * - path: /ws
 * - cors: 全开（小程序场景需要）
 * - transports: websocket（关闭 polling 轮询，减少握手开销）
 */
@WebSocketGateway({
  path: WS_PATH,
  namespace: '/',
  transports: ['websocket'],
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name)

  @WebSocketServer()
  private readonly server!: Server

  constructor(
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // -------------------- 生命周期 --------------------

  /** Gateway 初始化完成 */
  afterInit(): void {
    this.logger.log(`WebSocket gateway ready at path=${WS_PATH}`)
  }

  /**
   * 客户端连接时鉴权
   * 1. 从 socket.handshake.query.token 取 JWT
   * 2. 验证签名 + 过期时间
   * 3. 验证通过：socket.join(user:{userId})，并把 userId 挂到 socket.data
   * 4. 验证失败：socket.emit('error', ...) + disconnect
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client)
    if (!token) {
      this.logger.warn(`连接拒绝：缺少 token socket=${client.id}`)
      client.emit('error', { message: '未授权：缺少 token' })
      client.disconnect(true)
      return
    }

    let payload: CurrentUserPayload
    try {
      const decoded = this.jwtService.verify<Record<string, unknown>>(token)
      const userId = (decoded.userId as string | undefined) ?? (decoded.sub as string | undefined)
      if (!userId) {
        throw new Error('token payload 缺少 userId')
      }

      // 检查 jti 黑名单（与 JwtStrategy 保持一致）
      const jti = decoded.jti as string | undefined
      if (jti) {
        const isBlacklisted = await this.redis.exists(`auth:blacklist:${jti}`)
        if (isBlacklisted) {
          throw new Error('token 已被加入黑名单')
        }
      }

      // 检查改密踢下线标记
      const passwordChanged = await this.redis.exists(`user:password-changed:${userId}`)
      if (passwordChanged) {
        throw new Error('密码已修改，请重新登录')
      }

      payload = {
        userId,
        openid: decoded.openid as string | undefined,
        phone: decoded.phone as string | undefined,
        role: decoded.role as string | undefined,
      }
    } catch (err) {
      this.logger.warn(`连接拒绝：token 校验失败 socket=${client.id} err=${(err as Error).message}`)
      client.emit('error', { message: '未授权：token 无效或已过期' })
      client.disconnect(true)
      return
    }

    // 鉴权通过：加入房间 + 缓存 userId
    client.join(userRoom(payload.userId))
    ;(client.data as Record<string, unknown>).userId = payload.userId
    this.logger.log(
      `已连接 socket=${client.id} userId=${payload.userId} room=${userRoom(payload.userId)}`,
    )
  }

  /** 客户端断开 */
  handleDisconnect(client: Socket): void {
    const userId = (client.data as Record<string, unknown> | undefined)?.userId
    this.logger.log(`已断开 socket=${client.id} userId=${userId ?? 'unknown'}`)
  }

  // -------------------- 客户端 → 服务端 --------------------

  /**
   * 心跳：客户端发 ping，服务端回 pong
   * 客户端：socket.emit('ping', { ts: Date.now() })
   */
  @SubscribeMessage('ping')
  handlePing(@MessageBody() payload: { ts?: number } | undefined): {
    event: 'pong'
    data: { ts: number; clientTs?: number }
  } {
    return {
      event: 'pong',
      data: {
        ts: Date.now(),
        clientTs: payload?.ts,
      },
    }
  }

  // -------------------- 服务端 → 客户端 --------------------

  /**
   * 给指定用户推送消息
   * 通过房间 user:{userId} 一次性广播到该用户所有在线连接（多端登录场景）
   */
  pushToUser(
    userId: string,
    event: WsPushEvent,
    data: {
      workId?: string
      progress?: number
      message?: string
      notification?: unknown
      [key: string]: unknown
    },
  ): void {
    if (!this.server) {
      this.logger.warn(`server 未就绪，丢弃推送 userId=${userId} event=${event}`)
      return
    }
    this.server.to(userRoom(userId)).emit(event, data)
  }

  // -------------------- 工具方法 --------------------

  /** 从 handshake.query 或 auth 中提取 token */
  private extractToken(client: Socket): string | null {
    const query = client.handshake?.query
    if (query?.token) {
      // query 中所有值都是 string | string[] | undefined
      const t = query.token
      return Array.isArray(t) ? (t[0] ?? null) : ((t as string) ?? null)
    }
    // 兼容 socket.io v4 auth 字段
    const auth = (client.handshake as { auth?: Record<string, unknown> }).auth
    if (auth?.token && typeof auth.token === 'string') {
      return auth.token
    }
    return null
  }
}
