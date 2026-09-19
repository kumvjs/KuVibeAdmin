import { Module } from '@nestjs/common'
import { WsSessionService } from './ws-session.service.js'

@Module({
  controllers: [],
  providers: [WsSessionService],
  exports: [WsSessionService],
})
export class WsSessionModule {}
