import { RedisModule as NestRedisModule, RedisService as NestRedisService } from '@liaoliaots/nestjs-redis'
import { Global, Module, Provider } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { REDIS_CONFIG, RedisConfig } from '#/config/redis.config.js'
import { RedisService } from './redis.servie.js'

const providers: Provider[] = [
  RedisService,
]
@Global()
@Module({
  imports: [
    // redis
    NestRedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (rd: unknown) => {
        return ({
          readyLog: true,
          config: rd as RedisConfig,
        })
      },
      inject: [REDIS_CONFIG.KEY],
    }),
  ],
  providers,
  exports: [...providers], // 记得导出，否则 UserService 所在的模块会无法使用
})
export class RedisModule { }
