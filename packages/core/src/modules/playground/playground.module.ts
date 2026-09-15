import { Module } from '@nestjs/common'
import { PlaygroundController } from './playground.controller.js'
import { PlaygroundService } from './playground.service.js'

@Module({
  controllers: [PlaygroundController],
  providers: [PlaygroundService],
})
export class PlaygroundModule {}
