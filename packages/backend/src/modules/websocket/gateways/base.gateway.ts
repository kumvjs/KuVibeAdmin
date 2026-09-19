import type { WS_NS_Type } from '../common/constants/ws-ns.constants.js'
import { Logger, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common'
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets'
import { DefaultEventsMap, Namespace, RemoteSocket, Socket } from 'socket.io'
import { CatchEverythingFilter } from '#/common/filters/catch-everything.filter.js'
import { JwtAuthGuard } from '#/modules/auth/guards/jwt-auth.guard.js'
import { RbacGuard } from '#/modules/auth/guards/rbac.guard.js'
import { TokenService } from '#/modules/auth/services/token.service.js'
import { WsRoomKey, wsUidKeys } from '../common/constants/room-keys/index.js'
import { WsInterceptor } from '../interceptors/ws.interceptor.js'
import { WsServerService } from '../ws-server/ws-server.service.js'
import { WsSessionService } from '../ws-session/ws-session.service.js'

@UseGuards(JwtAuthGuard, RbacGuard)
@UseFilters(CatchEverythingFilter)
@UseInterceptors(WsInterceptor)
export abstract class BaseRbacGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  protected abstract readonly logger: Logger

  // 由 NestJS 在子类通过 @WebSocketServer() 注入，基类声明类型
  abstract server: Namespace

  constructor(
    protected readonly namespace: WS_NS_Type,
    protected readonly wsSession: WsSessionService,
    protected readonly wsServer: WsServerService,
    protected readonly tokenService: TokenService,
  ) { }

  /**
   * 确保在 Gateway 初始化后注册服务
   */
  afterInit(server: Namespace) {
    this.server = server // 确保引用正确
    this.wsServer.registerServer(this.namespace, this.server)
    this.logger.log(`🚀 WebSocket Gateway 成功初始化 — 命名空间: /${this.namespace}`)
  }

  /**
   * 客户端连接处理
   */
  async handleConnection(client: Socket) {
    /**
     * nestjs websocket 的 UseGuards 只能作用于接受信息，所以用户握手连接时并不会触发jwt 和 rbac 权限校验
     * 需要手动校验token，把loginUser挂在到client.user 下
     */
    const token = client.handshake.auth?.token
    const loginUser = await this.tokenService.verifyAccessToken(token)
    // 💡 优化：如果网关强制需要鉴权，而连接没有用户信息，建议直接拒绝连接
    if (!loginUser) {
      this.logger.warn(`[Connection Denied] 客户端未授权或缺少用户信息: ${client.id}`)
      client.disconnect(true)
      return
    }
    client.user = loginUser

    const userKey = wsUidKeys.user(loginUser.uid.toString())
    this.wsSession.add(this.namespace, userKey, client)

    this.logger.log(`🟢 客户端已连接: ${client.id} (userId:${loginUser.uid})`)
  }

  /**
   * 客户端断开连接处理
   */
  handleDisconnect(client: Socket) {
    const user = client.user

    if (user) {
      const userKey = wsUidKeys.user(user.uid.toString())
      this.wsSession.remove(this.namespace, userKey, client)
      this.logger.log(`🔴 客户端已断开: ${client.id} (userId: ${user.uid})`)
    }
    else {
      this.logger.log(`🔴 未知客户端断开: ${client.id}`)
    }
  }
  /**
   * 供子类调用的通用加入房间逻辑
   */

  protected joinRoom(client: Socket, roomKey: WsRoomKey): void {
    client.join(roomKey)
    this.logger.log(`🚪 客户端 ${client.id} 成功加入房间: ${roomKey}`)
  }

  /**
   * 供子类调用的通用离开房间逻辑
   */
  protected leaveRoom(client: Socket, roomKey: WsRoomKey): void {
    client.leave(roomKey)
    this.logger.log(`🚪 客户端 ${client.id} 离开房间: ${roomKey}`)
  }

  protected async getRoomSockets(
    roomKey: WsRoomKey,
  ): Promise<RemoteSocket<DefaultEventsMap, Record<string, unknown>>[]> {
    return this.server.in(roomKey).fetchSockets()
  }

  protected async getRoomSocketIds(
    roomKey: WsRoomKey,
  ): Promise<string[]> {
    const sockets = await this.getRoomSockets(roomKey)
    return sockets.map(s => s.id)
  }

  protected async getRoomSize(
    roomKey: WsRoomKey,
  ): Promise<number> {
    const sockets = await this.getRoomSockets(roomKey)
    return sockets.length
  }
}
