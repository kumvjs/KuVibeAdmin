import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { OrdersService } from './orders.service.js'
import { BillingOutboxService } from './outbox.service.js'

@Injectable()
export class BillingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingWorker.name)
  private timer?: ReturnType<typeof setInterval>
  private active = false

  constructor(private readonly outbox: BillingOutboxService, private readonly orders: OrdersService) {}

  onModuleInit() {
    if (process.env.BILLING_WORKER_ENABLED === 'false')
      return
    this.timer = setInterval(() => {
      void this.tick()
    }, 5000)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer)
      clearInterval(this.timer)
  }

  async tick() {
    if (this.active)
      return
    this.active = true
    try {
      // 后续渠道handler注册后扩展；不能领取尚未实现的网络任务并伪造成功。
      for (const lease of await this.outbox.claim(['order_expire'], 5, 60)) {
        try {
          await this.orders.expire(lease.aggregateId)
          await this.outbox.complete(lease)
        }
        catch {
          await this.outbox.fail(lease, 'order_expire_failed')
        }
      }
    }
    catch {
      this.logger.error('账务任务执行失败，请检查数据库连接和待处理任务；未记录渠道敏感响应')
    }
    finally {
      this.active = false
    }
  }
}
