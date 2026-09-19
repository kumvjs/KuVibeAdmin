import { Injectable, Logger } from '@nestjs/common'
import { Namespace } from 'socket.io'
import { WS_NS_Type } from '../common/constants/ws-ns.constants.js'

@Injectable()
export class WsServerService {
  protected readonly logger = new Logger(WsServerService.name)
  private readonly servers = new Map<WS_NS_Type, Namespace>()

  registerServer(namespace: WS_NS_Type, server: Namespace) {
    this.servers.set(namespace, server)
    this.logger.log(`WsServerService registerServer — namespace: /${namespace}`)
  }

  getServerList() {
    return this.servers
  }

  getServer(namespace: WS_NS_Type) {
    return this.servers.get(namespace)
  }
}
