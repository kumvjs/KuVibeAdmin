import { Module } from '@nestjs/common'
import { PlaygroundUploadService } from './playground-upload.service.js'
import { PlaygroundController } from './playground.controller.js'
import { PlaygroundService } from './playground.service.js'

@Module({
  controllers: [PlaygroundController],
  providers: [PlaygroundService, PlaygroundUploadService],
})
export class PlaygroundModule {}
