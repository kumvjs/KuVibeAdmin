import { Module } from '@nestjs/common'
import { WsServerService } from './ws-server.service.js'

@Module({
  providers: [WsServerService],
  exports: [WsServerService],
})
export class WsServerModule {}
