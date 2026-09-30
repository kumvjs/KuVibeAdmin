import type { EntityManager } from 'typeorm'
import type { ProviderPayment } from '../payments/payment.types.js'
import type { ProviderRefund, RefundCommand } from './refund.types.js'
import { createHash, randomUUID } from 'node:crypto'
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import { OrdersService } from '../orders/orders.service.js'
import { BillingOutboxService } from '../orders/outbox.service.js'
import { AlipayProvider } from '../payments/alipay.provider.js'
import { PaymentAttemptEntity } from '../payments/entities/payment-attempt.entity.js'
import { PaymentInboxEntity } from '../payments/entities/payment-inbox.entity.js'
import { PaymentTransactionEntity } from '../payments/entities/payment-transaction.entity.js'
import { ChannelPendingError } from '../payments/payment.types.js'
import { WechatProvider } from '../payments/wechat.provider.js'
import { PointAccountEntity } from '../points/entities/point-account.entity.js'
import { PointLedgerEntity } from '../points/entities/point-ledger.entity.js'
import { PointLotEntity } from '../points/entities/point-lot.entity.js'
import { PointsService } from '../points/points.service.js'
import { positiveInteger } from '../points/points.types.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { BillingRiskEntity } from './entities/billing-risk.entity.js'
import { RechargeRefundEntity } from './entities/recharge-refund.entity.js'

@Injectable()
export class RefundsService {
  constructor(private readonly source: DataSource, private readonly orders: OrdersService, private readonly points: PointsService, private readonly outbox: BillingOutboxService, private readonly wechat: WechatProvider, private readonly alipay: AlipayProvider) {}

  async list(orderId: string) {
    positiveInteger(orderId, 'orderId')
    return this.source.getRepository(RechargeRefundEntity).find({ where: { orderId, tenantId: '1' }, order: { id: 'DESC' } })
  }

  async request(orderId: string, command: RefundCommand, actorId: string) {
    positiveInteger(orderId, 'orderId')
    positiveInteger(actorId, 'actorId')
    this.validate(command)
    const hash = createHash('sha256').update(JSON.stringify({ ...command, actorId })).digest('hex')
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: orderId, tenantId: '1' })
    return billingTransaction(this.source, async (manager) => {
      const order = await this.lock(manager, hint)
      const repository = manager.getRepository(RechargeRefundEntity)
      const duplicate = await repository.findOneBy({ orderId, requestKey: command.idempotencyKey })
      if (duplicate) {
        if (duplicate.requestHash !== hash)
          throw new ConflictException('退款幂等键已用于不同申请')
        return duplicate
      }
      if (!['wechat', 'alipay'].includes(order.channel))
        throw new ConflictException('内购退款须由商店处理，服务器通过验真通知恢复账务')
      const transaction = await manager.getRepository(PaymentTransactionEntity).findOneBy({ orderId })
      if (!transaction || !['paid', 'review'].includes(order.status) || (!order.paidLedgerId && order.status !== 'review'))
        throw new ConflictException('仅允许已入账订单或已确认的迟到款进行全额退款')
      if (await repository.existsBy({ orderId, status: In(['held', 'processing', 'succeeded']) }))
        throw new ConflictException('订单已有退款处理中或已完成')
      if (await manager.getRepository(BillingRiskEntity).existsBy({ orderId, status: 'open' }))
        throw new ConflictException('原订单已有未处置的退款风险，须先人工复核再申请')
      await this.assertCashBinding(manager, order)
      const rights = await this.rights(manager, order)
      if (rights.available !== rights.total || rights.frozen !== 0n)
        throw new ConflictException('原订单积分已消费或冻结，不能自动申请退款')
      const refundNo = randomUUID().replaceAll('-', '')
      const held = rights.total ? await this.point(manager, order, 'freeze', rights.total, `refund:${refundNo}:freeze`, command.reason, rights.ids, actorId) : null
      const row = await repository.save({ orderId, requestKey: command.idempotencyKey, requestHash: hash, refundNo, channel: order.channel, kind: 'manual', status: 'held', amountMinor: order.payableMinor, sourcePoints: rights.total.toString(), holdId: held?.holdId ?? null, actorId, reason: command.reason })
      await manager.getRepository(RechargeOrderEntity).update(orderId, { status: 'refund_pending' })
      await this.outbox.enqueue(manager, 'refund_execute', row.id, `refund:${row.id}:execute`)
      await this.orders.event(manager, orderId, 'refund_requested', actorId, command.reason)
      return row
    })
  }

  async process(id: string) {
    const row = await this.source.getRepository(RechargeRefundEntity).findOneByOrFail({ id })
    if (!['held', 'processing'].includes(row.status))
      return
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: row.orderId })
    const execute = await billingTransaction(this.source, async (manager) => {
      const order = await this.lock(manager, hint)
      const current = await manager.getRepository(RechargeRefundEntity).findOneByOrFail({ id })
      if (!['held', 'processing'].includes(current.status) || order.status !== 'refund_pending')
        return false
      await this.assertCashBinding(manager, order)
      await manager.getRepository(RechargeRefundEntity).update(id, { status: 'processing' })
      return true
    })
    if (!execute)
      return
    const provider = this.provider(hint)
    // 固定退款编号、金额；申请失败也必须查单，不能据网络异常解冻。
    try {
      await provider.refund(hint, row.refundNo, row.reason)
    }
    catch { /* 未知状态由下面验签查单确认；最终失败交由outbox记录。 */ }
    const proof = await provider.refundQuery(row.refundNo, hint.merchantNo)
    await this.confirm(row.id, proof)
    if (proof.state === 'processing' || proof.state === 'review')
      throw new ChannelPendingError('渠道退款处理中，保留原积分冻结')
  }

  async confirm(id: string, proof: ProviderRefund) {
    const hint = await this.source.getRepository(RechargeRefundEntity).findOneByOrFail({ id })
    const orderHint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: hint.orderId })
    return billingTransaction(this.source, async (manager) => {
      const order = await this.lock(manager, orderHint)
      const row = await manager.getRepository(RechargeRefundEntity).findOneByOrFail({ id })
      const attempt = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId: order.id })
      const transaction = await manager.getRepository(PaymentTransactionEntity).findOneByOrFail({ orderId: order.id })
      if (proof.channel !== row.channel || proof.merchantNo !== order.merchantNo || proof.refundNo !== row.refundNo || proof.transactionKey !== transaction.transactionKey || proof.merchantId !== attempt.binding.merchantId || proof.environment !== attempt.binding.environment || proof.originalMinor !== order.payableMinor || proof.refundMinor !== row.amountMinor || proof.currency !== 'CNY')
        throw new ConflictException('退款验真事实与原交易、商户或全额申请不匹配')
      if (!['held', 'processing'].includes(row.status))
        return row
      if (proof.state === 'processing')
        return row
      if (proof.state === 'review') {
        await this.risk(manager, order, `refund_abnormal_${row.id}`, 0n)
        await this.orders.event(manager, order.id, 'refund_review', null, '渠道退款异常，保留冻结并人工复核')
        // 保留processing，允许人工恢复同一任务查单。
        return row
      }
      const rights = await this.rights(manager, order)
      if (row.holdId && rights.total) {
        await this.point(manager, order, proof.state === 'succeeded' ? 'capture' : 'unfreeze', rights.total, `refund:${row.id}:${proof.state}`, row.reason, rights.ids, row.actorId, row.holdId)
      }
      const succeeded = proof.state === 'succeeded'
      await manager.getRepository(RechargeRefundEntity).update(row.id, { status: succeeded ? 'succeeded' : 'failed', recoveredPoints: succeeded ? row.sourcePoints : '0', evidenceHash: proof.evidenceHash })
      await manager.getRepository(RechargeOrderEntity).update(order.id, { status: succeeded ? 'refunded' : order.paidLedgerId ? 'paid' : 'review' })
      await this.orders.event(manager, order.id, succeeded ? 'refund_succeeded' : 'refund_closed', null, succeeded ? '验签查单确认全额退款，扣回原冻结积分；首单及售出额度保留' : '渠道明确确认退款关闭，解冻原积分')
      return manager.getRepository(RechargeRefundEntity).findOneByOrFail({ id })
    })
  }

  async verify(id: string) {
    const row = await this.source.getRepository(RechargeRefundEntity).findOneByOrFail({ id })
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: row.orderId })
    await billingTransaction(this.source, manager => this.assertCashBinding(manager, order))
    const proof = await this.provider(order).refundQuery(row.refundNo, order.merchantNo)
    if (proof.state !== 'succeeded')
      throw new ChannelPendingError('退款尚未确认成功，对账保持待核查')
    return this.confirm(id, proof)
  }

  async processNotification(orderId: string, refundNo: string, inboxId: string) {
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: orderId })
    const proof = await this.wechat.refundQuery(refundNo)
    const manual = await this.source.getRepository(RechargeRefundEntity).findOneBy({ refundNo, orderId })
    if (manual) {
      await this.confirm(manual.id, proof)
      if (proof.state === 'processing' || proof.state === 'review')
        throw new ChannelPendingError('退款未完成，保留通知任务')
      await billingTransaction(this.source, manager => this.inbox(manager, inboxId, 'done'))
      return
    }
    if (proof.state === 'processing')
      throw new ChannelPendingError('外部退款处理中')
    await billingTransaction(this.source, async (manager) => {
      const order = await this.lock(manager, hint)
      const attempt = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId })
      const transaction = await manager.getRepository(PaymentTransactionEntity).findOneBy({ orderId })
      if (!transaction || proof.merchantNo !== order.merchantNo || proof.transactionKey !== transaction.transactionKey || proof.channel !== order.channel || proof.merchantId !== attempt.binding.merchantId || proof.environment !== attempt.binding.environment || proof.originalMinor !== order.payableMinor || proof.currency !== 'CNY')
        throw new ConflictException('外部退款不匹配原订单验真交易')
      if (proof.state === 'closed') {
        await this.inbox(manager, inboxId, 'done')
        return
      }
      if (proof.state === 'review') {
        await this.risk(manager, order, `refund_abnormal_${proof.evidenceHash.slice(0, 16)}`, 0n)
        await this.inbox(manager, inboxId, 'review', 'refund_channel_abnormal')
        return
      }
      await this.recover(manager, order, { ...transaction.facts, state: 'refunded', refundScope: proof.refundMinor === proof.originalMinor ? 'full' : 'partial', evidenceHash: proof.evidenceHash }, inboxId)
    })
  }

  /** 已认证的外部退款事实；由settlement持有用户/订单锁后调用。 */
  async recover(manager: EntityManager, order: RechargeOrderEntity, payment: ProviderPayment, inboxId: string | null) {
    const transaction = await manager.getRepository(PaymentTransactionEntity).findOneBy({ orderId: order.id })
    if (transaction && transaction.transactionKey !== payment.transactionKey)
      throw new ConflictException('退款交易凭据不属于原订单')
    if (payment.refundScope !== 'full') {
      await this.risk(manager, order, `refund_scope_${payment.evidenceHash.slice(0, 16)}`, 0n)
      await this.inbox(manager, inboxId, 'review', 'refund_not_verified_full')
      await this.orders.event(manager, order.id, 'refund_review', null, '未确认全额退款或部分退款，限制消费并人工核查')
      return { status: 'review' }
    }
    if (order.status === 'refunded') {
      await this.inbox(manager, inboxId, 'done')
      return { status: 'refunded' }
    }
    const rights = await this.rights(manager, order)
    const key = `external:${order.id}`
    if (rights.available)
      await this.point(manager, order, 'debit', rights.available, `${key}:available`, '验真外部全额退款，定向扣回原可用积分', rights.ids)
    if (rights.frozen) {
      const holds = await manager.query(`SELECT h.id::text, SUM(i.remaining)::text AS amount FROM biz_point_hold h JOIN biz_point_hold_item i ON i.hold_id=h.id JOIN biz_point_lot l ON l.id=i.lot_id WHERE l.grant_id=ANY($1::bigint[]) AND i.remaining>0 GROUP BY h.id ORDER BY h.id`, [rights.ids])
      let captured = 0n
      for (const hold of holds) {
        const amount = BigInt(hold.amount)
        await this.point(manager, order, 'capture', amount, `${key}:hold:${hold.id}`, '验真外部全额退款，定向扣回原冻结积分', rights.ids, null, hold.id)
        captured += amount
      }
      if (captured !== rights.frozen)
        throw new ConflictException('原订单冻结明细与批次不一致，整笔退款账务回滚')
    }
    const recovered = rights.available + rights.frozen
    const gap = rights.total - recovered
    const refunds = manager.getRepository(RechargeRefundEntity)
    const manual = await refunds.findOneBy({ orderId: order.id, status: In(['held', 'processing']) })
    if (manual) {
      await refunds.update(manual.id, { status: 'succeeded', recoveredPoints: recovered.toString(), gapPoints: gap.toString(), evidenceHash: payment.evidenceHash })
    }
    else {
      await refunds.insert({ orderId: order.id, requestKey: key, requestHash: createHash('sha256').update(key).digest('hex'), refundNo: randomUUID().replaceAll('-', ''), channel: order.channel, kind: 'external', status: 'succeeded', amountMinor: order.payableMinor, sourcePoints: rights.total.toString(), holdId: null, actorId: null, reason: '渠道验真全额退款', recoveredPoints: recovered.toString(), gapPoints: gap.toString(), evidenceHash: payment.evidenceHash })
    }
    if (gap)
      await this.risk(manager, order, 'refund_consumed_gap', gap)
    // 尚未入账的商店退款不占首单；经review中间态遵循既有数据库状态机。
    if (!['paid', 'refund_pending', 'review'].includes(order.status))
      await manager.getRepository(RechargeOrderEntity).update(order.id, { status: 'review' })
    await manager.getRepository(RechargeOrderEntity).update(order.id, { status: 'refunded' })
    await this.orders.event(manager, order.id, 'external_refund', null, `原订单权益${rights.total}；扣回${recovered}；已消费缺口${gap}；不恢复首单或已核销额度`)
    await this.inbox(manager, inboxId, 'done')
    return { status: 'refunded' }
  }

  async risks(userId: string) {
    positiveInteger(userId, 'userId')
    return this.source.getRepository(BillingRiskEntity).find({ where: { userId, tenantId: '1' }, order: { id: 'DESC' }, take: 100 })
  }

  async resolveRisk(id: string, reason: string, actorId: string) {
    positiveInteger(id, 'riskId')
    positiveInteger(actorId, 'actorId')
    if (!reason?.trim() || reason.length > 500)
      throw new ConflictException('必须填写500字以内的人工处置依据')
    const hint = await this.source.getRepository(BillingRiskEntity).findOneBy({ id })
    if (!hint)
      throw new NotFoundException('风险记录不存在')
    const orderHint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: hint.orderId })
    return billingTransaction(this.source, async (manager) => {
      const order = await this.lock(manager, orderHint)
      const row = await manager.getRepository(BillingRiskEntity).findOneByOrFail({ id })
      if (row.status === 'resolved') {
        if (row.resolvedBy !== actorId || row.resolutionReason !== reason)
          throw new ConflictException('风险记录已由其他处置解决')
        return row
      }
      await manager.getRepository(PointAccountEntity).findOneOrFail({ where: { userId: row.userId }, lock: { mode: 'pessimistic_write' } })
      await manager.getRepository(BillingRiskEntity).update(id, { status: 'resolved', resolvedBy: actorId, resolutionReason: reason, resolvedAt: () => 'NOW()' })
      if (!await manager.getRepository(BillingRiskEntity).existsBy({ userId: row.userId, status: 'open' }))
        await manager.getRepository(PointAccountEntity).update({ userId: row.userId }, { status: 'active' })
      await this.orders.event(manager, order.id, 'risk_resolved', actorId, `风险${id}人工处置：${reason}；不创建虚假退款或积分流水`)
      return manager.getRepository(BillingRiskEntity).findOneByOrFail({ id })
    })
  }

  async risk(manager: EntityManager, order: RechargeOrderEntity, type: string, gap: bigint) {
    const accounts = manager.getRepository(PointAccountEntity)
    await accounts.createQueryBuilder().insert().values({ userId: order.userId }).orIgnore().execute()
    await accounts.findOneOrFail({ where: { userId: order.userId }, lock: { mode: 'pessimistic_write' } })
    await manager.getRepository(BillingRiskEntity).createQueryBuilder().insert().values({ userId: order.userId, orderId: order.id, type, gapPoints: gap.toString() }).orIgnore().execute()
    if (await manager.getRepository(BillingRiskEntity).existsBy({ userId: order.userId, status: 'open' }))
      await accounts.update({ userId: order.userId }, { status: 'blocked' })
  }

  private async rights(manager: EntityManager, order: RechargeOrderEntity) {
    const ids = [order.paidLedgerId, order.giftLedgerId].filter((id): id is string => !!id)
    if (!ids.length)
      return { ids, total: 0n, available: 0n, frozen: 0n }
    const account = await manager.getRepository(PointAccountEntity).findOneOrFail({ where: { userId: order.userId }, lock: { mode: 'pessimistic_write' } })
    const ledgers = await manager.getRepository(PointLedgerEntity).findBy({ id: In(ids), action: 'grant', businessType: 'recharge' })
    const lots = await manager.getRepository(PointLotEntity).find({ where: { grantId: In(ids) }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } })
    const total = ledgers.reduce((sum, item) => sum + BigInt(item.amount), 0n)
    if (ledgers.length !== ids.length || lots.length !== ids.length || ledgers.some(ledger => ledger.accountId !== account.id) || lots.some(lot => !ledgers.some(ledger => ledger.id === lot.grantId && ledger.accountId === lot.accountId && ledger.amount === lot.initial)) || total !== lots.reduce((sum, lot) => sum + BigInt(lot.initial), 0n))
      throw new ConflictException('原订单积分批次或发放流水不完整，禁止自动退款')
    return { ids, total, available: lots.reduce((sum, lot) => sum + BigInt(lot.available), 0n), frozen: lots.reduce((sum, lot) => sum + BigInt(lot.frozen), 0n) }
  }

  private point(manager: EntityManager, order: RechargeOrderEntity, action: 'freeze' | 'capture' | 'unfreeze' | 'debit', amount: bigint, key: string, reason: string, ids: string[], actorId: string | null = null, holdId?: string) {
    return this.points.executeInTransaction(manager, { userId: order.userId, action, amount: amount.toString(), businessType: 'recharge_refund', businessKey: key, reason, actorId, ...(holdId ? { holdId } : {}) }, { trustedUserLocked: true, allowInactive: true, ...(action === 'unfreeze' ? {} : { sourceGrantIds: ids }) })
  }

  private async lock(manager: EntityManager, hint: RechargeOrderEntity) {
    await manager.getRepository(SysUserEntity).findOneOrFail({ where: { id: hint.userId, tenantId: '1' }, withDeleted: true, lock: { mode: 'pessimistic_read' } })
    await this.orders.lockUserState(manager, hint.userId)
    return this.orders.lockOrder(manager, hint.id, hint.userId)
  }

  private provider(order: RechargeOrderEntity) {
    if (order.channel === 'wechat')
      return this.wechat
    if (order.channel === 'alipay')
      return this.alipay
    throw new ServiceUnavailableException('商店退款只能通过商店通知和查单验真')
  }

  private async assertCashBinding(manager: EntityManager, order: RechargeOrderEntity) {
    const attempt = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId: order.id })
    const current = order.channel === 'wechat' ? this.wechat.binding(order.client) : this.alipay.binding()
    if (current.applicationId !== attempt.binding.applicationId || current.merchantId !== attempt.binding.merchantId || current.environment !== attempt.binding.environment)
      throw new ServiceUnavailableException('退款须使用原交易商户、应用和环境配置')
  }

  private async inbox(manager: EntityManager, id: string | null, status: 'done' | 'review', reason: string | null = null) {
    if (id)
      await manager.getRepository(PaymentInboxEntity).update(id, { status, reason })
  }

  private validate(command: RefundCommand) {
    if (!/^[\w:.-]{1,120}$/.test(command.idempotencyKey) || !command.reason?.trim() || command.reason.length > 500)
      throw new ConflictException('退款须提供受限幂等键及500字以内原因')
  }
}
