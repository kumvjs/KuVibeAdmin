import { RedisService as NestRedisService } from '@liaoliaots/nestjs-redis'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly nestRedisService: NestRedisService) { }

  onModuleInit() {
    // 初始化
  }

  getClient(namespace?: string) {
    return this.nestRedisService.getOrThrow(namespace)
  }
}
