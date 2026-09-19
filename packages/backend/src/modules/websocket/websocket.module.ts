import { Module } from '@nestjs/common'
import { WsInterceptor } from './interceptors/ws.interceptor.js'
import { WsPushModule } from './ws-push/ws-push.module.js'
import { WsServerModule } from './ws-server/ws-server.module.js'
import { WsSessionModule } from './ws-session/ws-session.module.js'

@Module({
  imports: [WsSessionModule, WsServerModule, WsPushModule],
  providers: [WsInterceptor],
  exports: [WsInterceptor],
})
export class WebsocketModule { }
