import { Injectable, Logger } from '@nestjs/common'
import { Socket } from 'socket.io'
import { WS_NS_Type } from '../common/constants/ws-ns.constants.js'

/** 会话所属的命名空间类型 */
export type SessionNamespace = WS_NS_Type

@Injectable()
export class WsSessionService {
  private readonly logger = new Logger(WsSessionService.name)

  /**
   * 三层 Map 结构：namespace → uid → Set<Socket>
   * @example
   *   'live'   → 'u-123' → Set<Socket>
   *   'device' → 'd-456' → Set<Socket>
   */
  private readonly sessions = new Map<SessionNamespace, Map<string, Set<Socket>>>()

  // ─── 内部工具 ────────────────────────────────────────────

  /** 获取命名空间的 uid→sockets 映射，不存在时自动初始化 */
  private getOrCreateNsStore(namespace: SessionNamespace): Map<string, Set<Socket>> {
    let store = this.sessions.get(namespace)
    if (!store) {
      store = new Map()
      this.sessions.set(namespace, store)
    }
    return store
  }

  // ─── 核心 CRUD ───────────────────────────────────────────

  /** 注册 socket 到会话 */
  add(namespace: SessionNamespace, uid: string, client: Socket): void {
    const store = this.getOrCreateNsStore(namespace)
    let sockets = store.get(uid)
    if (!sockets) {
      sockets = new Set()
      store.set(uid, sockets)
    }
    sockets.add(client)
    this.logger.debug(`[add] ns=${namespace} uid=${uid} total=${sockets.size}`)
  }

  /** 移除 socket，自动清理空 uid / 空 namespace */
  remove(namespace: SessionNamespace, uid: string, client: Socket): void {
    const store = this.sessions.get(namespace)
    const sockets = store?.get(uid)
    if (!sockets)
      return

    sockets.delete(client)
    this.logger.debug(`[remove] ns=${namespace} uid=${uid} remaining=${sockets.size}`)

    if (sockets.size === 0) {
      store!.delete(uid)
      if (store!.size === 0)
        this.sessions.delete(namespace)
    }
  }

  // ─── 查询 ────────────────────────────────────────────────

  /** 获取某用户在指定命名空间下的所有 socket */
  getSockets(namespace: SessionNamespace, uid: string): Socket[] {
    return [...(this.sessions.get(namespace)?.get(uid) ?? [])]
  }

  /** 判断用户是否在线 */
  isOnline(namespace: SessionNamespace, uid: string): boolean {
    return (this.sessions.get(namespace)?.get(uid)?.size ?? 0) > 0
  }

  /** 列出某命名空间下所有在线的 uid */
  listOnlineUids(namespace: SessionNamespace): string[] {
    return [...(this.sessions.get(namespace)?.keys() ?? [])]
  }

  /** 列出所有命名空间下的全部在线 socket */
  listAllSockets(): Socket[] {
    const result: Socket[] = []
    for (const store of this.sessions.values()) {
      for (const sockets of store.values()) {
        for (const socket of sockets)
          result.push(socket)
      }
    }
    return result
  }

  // ─── 推送 ────────────────────────────────────────────────

  /** 向指定用户的所有 socket 推送事件 */
  emitToUser(namespace: SessionNamespace, uid: string, event: string, data: unknown): void {
    const sockets = this.getSockets(namespace, uid)
    if (!sockets.length) {
      this.logger.debug(`[emitToUser] uid=${uid} offline, skipped`)
      return
    }
    sockets.forEach(s => s.emit(event, data))
    this.logger.debug(`[emitToUser] ns=${namespace} uid=${uid} event=${event} sockets=${sockets.length}`)
  }
}
