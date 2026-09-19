import { Module } from '@nestjs/common'
import { WsServerModule } from '../ws-server/ws-server.module.js'
import { WsSessionModule } from '../ws-session/ws-session.module.js'
import { WsPushService } from './ws-push.service.js'

@Module({
  imports: [WsServerModule, WsSessionModule],
  providers: [WsPushService],
  exports: [WsPushService],
})
export class WsPushModule {}
