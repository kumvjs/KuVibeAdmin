import type { InboxPayload } from './entities/payment-inbox.entity.js'
import type { PaymentBinding, ProviderPayment } from './payment.types.js'
import { randomUUID } from 'node:crypto'
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CatalogService } from '../catalog/catalog.service.js'
import { RechargeUserStateEntity } from '../catalog/entities/recharge-user-state.entity.js'
import { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import { OrdersService } from '../orders/orders.service.js'
import { BillingOutboxService } from '../orders/outbox.service.js'
import { positiveInteger } from '../points/points.types.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { AlipayProvider } from './alipay.provider.js'
import { PaymentAttemptEntity } from './entities/payment-attempt.entity.js'
import { PaymentInboxEntity } from './entities/payment-inbox.entity.js'
import { ChannelPendingError } from './payment.types.js'
import { SettlementService } from './settlement.service.js'
import { WechatProvider } from './wechat.provider.js'

@Injectable()
export class PaymentsService {
  constructor(private readonly source: DataSource, private readonly catalog: CatalogService, private readonly orders: OrdersService, private readonly outbox: BillingOutboxService, private readonly settlement: SettlementService, private readonly wechat: WechatProvider, private readonly alipay: AlipayProvider) {}

  async prepare(userId: string, id: string) {
    positiveInteger(id, 'orderId')
    return billingTransaction(this.source, async (manager) => {
      await this.catalog.requireUser(manager, userId)
      await this.orders.lockUserState(manager, userId)
      const order = await this.orders.lockOrder(manager, id, userId)
      const [{ expired }] = await manager.query('SELECT $1::timestamptz <= NOW() AS expired', [order.expiresAt])
      if (order.status !== 'pending' || expired)
        throw new ConflictException('订单已结束或到期，不能继续发起支付')
      const binding = this.binding(order)
      let attempt = await manager.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
      if (!attempt) {
        attempt = await manager.getRepository(PaymentAttemptEntity).save({ orderId: id, binding, storeToken: randomUUID(), status: 'queued' })
        await this.outbox.enqueue(manager, 'payment_prepare', id, `order:${id}:prepare`)
        await this.outbox.enqueue(manager, 'payment_poll', id, `order:${id}:poll`, new Date(Date.now() + 10000))
      }
      else {
        this.assertBinding(attempt.binding, binding)
      }
      return { orderId: id, status: attempt.status, parameters: attempt.status === 'ready' ? attempt.parameters : null }
    })
  }

  async acceptCash(payment: ProviderPayment) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneBy({ merchantNo: payment.merchantNo!, channel: payment.channel, tenantId: '1' })
    return this.inbox(payment.channel, payment.evidenceHash, order?.id ?? null, { payment })
  }

  async inbox(channel: ProviderPayment['channel'], hash: string, orderId: string | null, payload: InboxPayload) {
    return billingTransaction(this.source, async (manager) => {
      const repository = manager.getRepository(PaymentInboxEntity)
      await repository.createQueryBuilder().insert().values({ channel, evidenceHash: hash, orderId, payload, status: orderId ? 'pending' : 'review', reason: orderId ? null : 'unmatched_order' }).orIgnore().execute()
      const row = await repository.findOneByOrFail({ channel, evidenceHash: hash })
      if (row.orderId !== orderId)
        throw new ConflictException('同一支付凭据已绑定其他订单')
      if (row.status === 'pending')
        await this.outbox.enqueue(manager, 'payment_inbox', row.id, `inbox:${row.id}`)
      return { inboxId: row.id, status: row.status }
    })
  }

  async processInbox(id: string) {
    const row = await this.source.getRepository(PaymentInboxEntity).findOneByOrFail({ id })
    if (row.status !== 'pending' || !row.orderId)
      return
    if (!row.payload.payment)
      throw new Error('内购验真处理器尚未启用')
    await this.settlement.settle(row.orderId, row.payload.payment, id)
  }

  async processPrepare(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    const attempt = await billingTransaction(this.source, async (manager) => {
      await this.lockHistoricalUser(manager, order.userId)
      await this.orders.lockUserState(manager, order.userId)
      const locked = await this.orders.lockOrder(manager, id, order.userId)
      const row = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId: id })
      if (locked.status !== 'pending' || row.status === 'ready' || row.status === 'cancelled')
        return null
      const [{ expired }] = await manager.query('SELECT $1::timestamptz <= NOW() AS expired', [locked.expiresAt])
      if (expired)
        return null
      this.assertBinding(row.binding, this.binding(locked))
      await manager.getRepository(PaymentAttemptEntity).update(row.id, { status: 'starting' })
      await manager.getRepository(RechargeOrderEntity).update(id, { paymentInitiated: true })
      return row
    })
    if (!attempt)
      return
    // 网络请求绝不持有用户、订单或积分行锁；渠道使用固定merchantNo重试。
    const parameters = order.channel === 'wechat' ? await this.wechat.prepare(order, attempt.binding) : await this.alipay.prepare(order)
    await billingTransaction(this.source, async (manager) => {
      await this.lockHistoricalUser(manager, order.userId)
      await this.orders.lockUserState(manager, order.userId)
      await this.orders.lockOrder(manager, id, order.userId)
      const row = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ id: attempt.id })
      if (row.status === 'starting')
        await manager.getRepository(PaymentAttemptEntity).update(row.id, { status: 'ready', parameters })
    })
  }

  async poll(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    if (!['pending', 'closing'].includes(order.status))
      return
    const attempt = await this.source.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
    if (!attempt || attempt.status === 'queued')
      throw new ChannelPendingError('尚未向渠道发起支付')
    this.assertBinding(attempt.binding, this.binding(order))
    const payment = await this.provider(order).query(order.merchantNo)
    if (payment.state === 'paid' || payment.state === 'refunded') {
      await this.acceptCash(payment)
      return
    }
    if (order.status === 'closing') {
      await this.close(id)
      return
    }
    throw new ChannelPendingError('渠道尚未确认支付成功')
  }

  async close(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    if (order.status !== 'closing')
      return
    const attempt = await this.source.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
    if (!attempt)
      throw new ServiceUnavailableException('历史订单缺少渠道身份凭据，保留预占并人工核查')
    if (attempt.status !== 'queued' && attempt.status !== 'cancelled') {
      this.assertBinding(attempt.binding, this.binding(order))
      const provider = this.provider(order)
      let payment = await provider.query(order.merchantNo)
      if (payment.state === 'pending') {
        await provider.close(order.merchantNo)
        payment = await provider.query(order.merchantNo)
      }
      if (payment.state === 'paid' || payment.state === 'refunded') {
        await this.acceptCash(payment)
        return
      }
      if (payment.state !== 'closed' || payment.merchantNo !== order.merchantNo || payment.applicationId !== attempt.binding.applicationId || payment.merchantId !== attempt.binding.merchantId || payment.environment !== attempt.binding.environment)
        throw new ChannelPendingError('渠道未确认同一商户、应用和订单关单，保留预占')
    }
    await billingTransaction(this.source, async (manager) => {
      await this.lockHistoricalUser(manager, order.userId)
      const state = await this.orders.lockUserState(manager, order.userId)
      const locked = await this.orders.lockOrder(manager, id, order.userId)
      if (locked.status !== 'closing')
        return
      const current = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ id: attempt.id })
      // queued的检查与prepare启动共用订单锁，消除关单后仍发起网络请求的竞态。
      if (attempt.status === 'queued' && current.status !== 'queued')
        throw new ChannelPendingError('支付启动事实改变，重新查单确认')
      await this.orders.releaseReservations(manager, id)
      await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closed', closedAt: () => 'NOW()' })
      await manager.getRepository(PaymentAttemptEntity).update(current.id, { status: 'cancelled' })
      if (state.currentOrderId === id)
        await manager.getRepository(RechargeUserStateEntity).update(state.id, { currentOrderId: null })
      await this.orders.event(manager, id, 'closed', null, attempt.status === 'queued' ? '任务尚未开始，可安全关闭' : '渠道查单已确认关闭，释放预占一次')
    })
  }

  async ownOrder(userId: string, id: string) {
    positiveInteger(id, 'orderId')
    const row = await this.source.getRepository(RechargeOrderEntity).findOneBy({ id, userId, tenantId: '1' })
    if (!row)
      throw new NotFoundException('订单不存在')
    return row
  }

  private binding(order: RechargeOrderEntity): PaymentBinding {
    if (order.channel === 'wechat')
      return this.wechat.binding(order.client)
    if (order.channel === 'alipay')
      return this.alipay.binding()
    throw new ServiceUnavailableException('内购支付适配尚未启用')
  }

  private provider(order: RechargeOrderEntity) {
    if (order.channel === 'wechat')
      return this.wechat
    if (order.channel === 'alipay')
      return this.alipay
    throw new ServiceUnavailableException('该渠道不支持现金订单查单/关单')
  }

  private assertBinding(stored: PaymentBinding, current: PaymentBinding) {
    if (stored.applicationId !== current.applicationId || stored.merchantId !== current.merchantId || stored.environment !== current.environment)
      throw new ServiceUnavailableException('渠道身份配置已改变，保留原订单并使用原商户配置核查')
  }

  private lockHistoricalUser(manager: import('typeorm').EntityManager, userId: string) {
    return manager.getRepository(SysUserEntity).findOneOrFail({ where: { id: userId, tenantId: '1' }, withDeleted: true, lock: { mode: 'pessimistic_read' } })
  }
}
