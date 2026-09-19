import { Injectable, Logger } from '@nestjs/common'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { TraceContext } from '#/shared/logger/logger.service.js'
import { WsRoomKey, wsRoomKeyGen } from '../common/constants/room-keys/index.js'
import { WsEvent } from '../common/constants/ws-events/index.js'
import { WS_NS_Type } from '../common/constants/ws-ns.constants.js'
import { WsResOp } from '../dto/ws.dto.js'
import { WsServerService } from '../ws-server/ws-server.service.js'
import { WsSessionService } from '../ws-session/ws-session.service.js'

@Injectable()
export class WsPushService {
  private readonly logger = new Logger(WsPushService.name)

  constructor(
    private readonly wsSession: WsSessionService,
    private readonly wsServer: WsServerService,
  ) { }

  makeResData(data) {
    return WsResOp.success(data ?? null, ERROR_CODES.SUCCESS.message)
  }

  /**
   * 获取指定命名空间的 Socket.IO Server 实例
   * 内部方法，不对外暴露
   */
  private getNamespaceServer(namespace: WS_NS_Type) {
    const server = this.wsServer.getServer(namespace)
    if (!server) {
      this.logger.warn(`Namespace server not found: ${namespace}`)
    }
    return server
  }

  /**
   * 向指定命名空间下的所有连接广播事件
   * @param namespace 目标命名空间
   * @param event 事件名称
   * @param data 推送数据
   */
  emitToNamespace(namespace: WS_NS_Type, event: WsEvent, data: unknown): void {
    const server = this.getNamespaceServer(namespace)
    if (!server)
      return

    this.logger.debug(`[Namespace] ns=${namespace} event=${event}`)
    server.emit(event, this.makeResData(data))
  }

  /**
   * 向指定命名空间下的某个房间广播事件
   * @param namespace 目标命名空间
   * @param roomId 房间 ID
   * @param event 事件名称
   * @param data 推送数据
   */
  emitToRoom(namespace: WS_NS_Type, roomId: WsRoomKey, event: WsEvent, data: unknown): void {
    const server = this.getNamespaceServer(namespace)
    if (!server)
      return

    this.logger.debug(`[Room] ns=${namespace} roomId=${roomId} event=${event}`)
    server.to(roomId).emit(event, this.makeResData(data))
  }

  /**
   * 向指定命名空间下的某个用户推送事件（通过 userId 定位 socket）
   * @param namespace 目标命名空间
   * @param userId 目标用户 ID
   * @param event 事件名称
   * @param data 推送数据
   */
  emitToUser(namespace: WS_NS_Type, userId: string, event: WsEvent, data: unknown): void {
    this.logger.debug(`[User] ns=${namespace} userId=${userId} event=${event}`)
    this.wsSession.emitToUser(namespace, userId, event, this.makeResData(data))
  }
}
