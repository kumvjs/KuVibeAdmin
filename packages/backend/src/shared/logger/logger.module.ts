import { Global, Module } from '@nestjs/common'
import { LoggerService } from './logger.service.js'

@Global()
@Module({
  controllers: [],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
