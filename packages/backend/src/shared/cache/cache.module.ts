import { Global, Module } from '@nestjs/common'
import { CacheController } from './cache.controller.js'
import { CacheService } from './cache.service.js'
import { RedisModule } from './redis/redis.module.js'

@Global()
@Module({
  imports: [RedisModule],
  controllers: [CacheController],
  providers: [CacheService],
  exports: [CacheService, RedisModule],
})
export class CacheModule { }
