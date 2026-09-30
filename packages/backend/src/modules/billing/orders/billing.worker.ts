import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { ChannelPendingError } from '../payments/payment.types.js'
import { PaymentsService } from '../payments/payments.service.js'
import { ReconciliationService } from '../refunds/reconciliation.service.js'
import { RefundsService } from '../refunds/refunds.service.js'
import { OrdersService } from './orders.service.js'
import { BillingOutboxService } from './outbox.service.js'

@Injectable()
export class BillingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingWorker.name)
  private timer?: ReturnType<typeof setInterval>
  private active = false

  constructor(private readonly outbox: BillingOutboxService, private readonly orders: OrdersService, private readonly payments: PaymentsService, private readonly refunds?: RefundsService, private readonly reconcile?: ReconciliationService) {}

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
      const leases = await this.outbox.claim(['order_expire', 'payment_prepare', 'payment_poll', 'payment_inbox', 'order_close', 'google_consume', 'refund_execute', 'reconcile'], 5, 120)
      await Promise.all(leases.map(async (lease) => {
        try {
          if (lease.type === 'order_expire') {
            await this.orders.expire(lease.aggregateId)
          }
          else if (lease.type === 'payment_prepare') {
            await this.payments.processPrepare(lease.aggregateId)
          }
          else if (lease.type === 'payment_poll') {
            await this.payments.poll(lease.aggregateId)
          }
          else if (lease.type === 'payment_inbox') {
            await this.payments.processInbox(lease.aggregateId)
          }
          else if (lease.type === 'google_consume') {
            await this.payments.consume(lease.aggregateId)
          }
          else if (lease.type === 'refund_execute') {
            if (!this.refunds)
              throw new Error('退款处理器未配置')
            await this.refunds.process(lease.aggregateId)
          }
          else if (lease.type === 'reconcile') {
            if (!this.reconcile)
              throw new Error('对账处理器未配置')
            await this.reconcile.process(lease.aggregateId, lease.payload.repairProjection === 'true')
          }
          else {
            await this.payments.close(lease.aggregateId)
          }
          await this.outbox.complete(lease)
        }
        catch (error) {
          if (error instanceof ChannelPendingError)
            await this.outbox.defer(lease, 60)
          else
            await this.outbox.fail(lease, `${lease.type}_failed`)
        }
      }))
    }
    catch {
      this.logger.error('账务任务执行失败，请检查数据库连接和待处理任务；未记录渠道敏感响应')
    }
    finally {
      this.active = false
    }
  }
}
