import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { ChannelPendingError } from '../payments/payment.types.js'
import { PaymentsService } from '../payments/payments.service.js'
import { OrdersService } from './orders.service.js'
import { BillingOutboxService } from './outbox.service.js'

@Injectable()
export class BillingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingWorker.name)
  private timer?: ReturnType<typeof setInterval>
  private active = false

  constructor(private readonly outbox: BillingOutboxService, private readonly orders: OrdersService, private readonly payments: PaymentsService) {}

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
      for (const lease of await this.outbox.claim(['order_expire', 'payment_prepare', 'payment_poll', 'payment_inbox', 'order_close', 'google_consume'], 5, 120)) {
        try {
          if (lease.type === 'order_expire')
            await this.orders.expire(lease.aggregateId)
          else if (lease.type === 'payment_prepare')
            await this.payments.processPrepare(lease.aggregateId)
          else if (lease.type === 'payment_poll')
            await this.payments.poll(lease.aggregateId)
          else if (lease.type === 'payment_inbox')
            await this.payments.processInbox(lease.aggregateId)
          else if (lease.type === 'google_consume')
            await this.payments.consume(lease.aggregateId)
          else
            await this.payments.close(lease.aggregateId)
          await this.outbox.complete(lease)
        }
        catch (error) {
          if (error instanceof ChannelPendingError)
            await this.outbox.defer(lease, 60)
          else
            await this.outbox.fail(lease, `${lease.type}_failed`)
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
