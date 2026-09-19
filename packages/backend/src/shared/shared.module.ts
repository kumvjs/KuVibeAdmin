import { Global, Module } from '@nestjs/common'
import { CacheModule } from './cache/cache.module.js'

import { LoggerModule } from './logger/logger.module.js'

@Global()
@Module({
  imports: [LoggerModule, CacheModule],
  exports: [LoggerModule],
})
export class SharedModule {}
