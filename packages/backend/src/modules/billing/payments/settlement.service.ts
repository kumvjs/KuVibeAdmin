import type { EntityManager } from 'typeorm'
import type { ApplicablePromotion } from '../catalog/catalog.service.js'
import type { ConsecutiveQuoteContext } from '../catalog/catalog.types.js'
import type { ProviderPayment } from './payment.types.js'
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { getBusinessDate } from '#/utils/time.util.js'
import { CatalogService } from '../catalog/catalog.service.js'
import { calculateQuote } from '../catalog/catalog.types.js'
import { CouponEntity, PromotionVersionEntity } from '../catalog/entities/promotion.entity.js'
import { RechargeUserDayEntity, RechargeUserStateEntity } from '../catalog/entities/recharge-user-state.entity.js'
import { QuotaService } from '../catalog/quota.service.js'
import { nextRechargeStreak, readRechargeStreak, saveRechargeStreak } from '../catalog/recharge-streak.js'
import { OrderReservationEntity } from '../orders/entities/order-reservation.entity.js'
import { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import { OrdersService } from '../orders/orders.service.js'
import { BillingOutboxService } from '../orders/outbox.service.js'
import { PointsService } from '../points/points.service.js'
import { PG_BIGINT_MAX } from '../points/points.types.js'
import { RefundsService } from '../refunds/refunds.service.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { PaymentAttemptEntity } from './entities/payment-attempt.entity.js'
import { PaymentInboxEntity } from './entities/payment-inbox.entity.js'
import { PaymentTransactionEntity } from './entities/payment-transaction.entity.js'

/** 仅接受适配器验真后的事实，不提供可直接指定paid的HTTP接口。 */
@Injectable()
export class SettlementService {
  constructor(private readonly source: DataSource, private readonly catalog: CatalogService, private readonly orders: OrdersService, private readonly quotas: QuotaService, private readonly points: PointsService, private readonly outbox: BillingOutboxService, private readonly refunds?: RefundsService) {}

  async settle(id: string, payment: ProviderPayment, inboxId: string | null = null) {
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id, tenantId: '1' })
    return billingTransaction(this.source, async (manager) => {
      await manager.getRepository(SysUserEntity).findOneOrFail({ where: { id: hint.userId, tenantId: '1' }, withDeleted: true, lock: { mode: 'pessimistic_read' } })
      const state = await this.orders.lockUserState(manager, hint.userId)
      const order = await this.orders.lockOrder(manager, id, hint.userId)
      const attempt = await manager.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
      if (!attempt || !this.matches(order, attempt, payment)) {
        await this.review(manager, order, inboxId, 'payment_binding_mismatch')
        return { status: 'review' }
      }
      if (payment.state !== 'paid') {
        if (payment.state === 'refunded') {
          if (this.refunds)
            return this.refunds.recover(manager, order, payment, inboxId)
          await this.review(manager, order, inboxId, 'verified_refund_requires_recovery')
          return { status: 'review' }
        }
        if (payment.state === 'closed' && order.paidLedgerId) {
          await this.review(manager, order, inboxId, 'closed_paid_transaction_requires_refund_proof')
          return { status: 'review' }
        }
        if (payment.state === 'closed' && ['apple', 'google'].includes(order.channel) && order.status === 'pending') {
          await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closed', closedAt: () => 'NOW()' })
          await this.orders.event(manager, id, 'store_cancelled', null, '已验真商店取消，未发放权益或占用首单资格')
        }
        await this.done(manager, inboxId)
        return { status: payment.state }
      }
      // 用户锁保证同一用户首单互斥；交易锁保证跨用户重复凭据也不重复履约。
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${payment.channel}:${payment.transactionKey}`])
      const transactions = manager.getRepository(PaymentTransactionEntity)
      const duplicate = await transactions.findOneBy({ channel: payment.channel, transactionKey: payment.transactionKey })
      if (duplicate && duplicate.orderId !== id) {
        await this.review(manager, order, inboxId, 'transaction_already_bound')
        return { status: 'review' }
      }
      const existing = await transactions.findOneBy({ orderId: id })
      if (existing && existing.transactionKey !== payment.transactionKey) {
        await this.review(manager, order, inboxId, 'multiple_transactions_for_order')
        return { status: 'review' }
      }
      if (existing || order.paidLedgerId) {
        await this.done(manager, inboxId)
        return { status: order.status }
      }
      if (!['pending', 'closing'].includes(order.status)) {
        await transactions.insert({ orderId: id, channel: payment.channel, transactionKey: payment.transactionKey, facts: payment, inboxId, bonusPoints: '0' })
        await this.review(manager, order, inboxId, 'late_payment_after_local_close')
        return { status: 'review' }
      }
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now')
      const date = getBusinessDate('Asia/Shanghai', now)
      const streak = nextRechargeStreak(await readRechargeStreak(manager, order.userId, order.packageId), date)
      await manager.getRepository(RechargeUserDayEntity).createQueryBuilder().insert().values({ userId: order.userId, businessDate: date }).orIgnore().execute()
      const day = await manager.getRepository(RechargeUserDayEntity).findOneByOrFail({ userId: order.userId, businessDate: date, tenantId: '1' })
      await this.catalog.lockPackage(manager, order.packageId, 'pessimistic_read')
      const bonusPoints = await this.bonus(manager, order, date, now, !state.firstOrderId, !day.firstOrderId, streak)
      const reservations = await manager.getRepository(OrderReservationEntity).findBy({ orderId: id, status: 'held' })
      await this.quotas.finish(manager, reservations, 'consume')
      for (const reservation of reservations)
        await manager.getRepository(OrderReservationEntity).update(reservation.id, { status: 'consumed' })
      const grant = (amount: string, kind: 'paid' | 'gift') => this.points.executeInTransaction(manager, { userId: order.userId, action: 'grant', amount, kind, businessType: 'recharge', businessKey: `order:${id}:${kind}`, actorId: null, reason: `已验真充值订单${order.merchantNo}` }, { trustedUserLocked: true, allowInactive: true })
      const paid = await grant(order.snapshot.basePoints, 'paid')
      const giftAmount = (BigInt(order.snapshot.giftPoints) + BigInt(bonusPoints)).toString()
      const gift = giftAmount === '0' ? null : await grant(giftAmount, 'gift')
      await transactions.insert({ orderId: id, channel: payment.channel, transactionKey: payment.transactionKey, facts: payment, inboxId, bonusPoints })
      await manager.getRepository(RechargeOrderEntity).update(id, { status: 'paid', settledAt: now, paidLedgerId: paid.id, giftLedgerId: gift?.id ?? null })
      await saveRechargeStreak(manager, order.userId, order.packageId, streak)
      await manager.getRepository(RechargeUserStateEntity).update(state.id, { settlementSequence: (BigInt(state.settlementSequence) + 1n).toString(), firstOrderId: state.firstOrderId ?? id, ...(state.currentOrderId === id ? { currentOrderId: null } : {}) })
      if (!day.firstOrderId)
        await manager.getRepository(RechargeUserDayEntity).update(day.id, { firstOrderId: id })
      if (order.channel === 'google' && inboxId)
        await this.outbox.enqueue(manager, 'google_consume', inboxId, `order:${id}:consume`)
      await this.orders.event(manager, id, 'settled', null, `验真、额度核销、积分与成功事实同事务提交；本套餐${date}连续充值${streak.consecutiveDays}天，${streak.firstOfDay ? '当日首笔' : '当日再次充值'}`)
      await this.done(manager, inboxId)
      return { status: 'paid' }
    })
  }

  private matches(order: RechargeOrderEntity, attempt: PaymentAttemptEntity, payment: ProviderPayment) {
    const binding = attempt.binding
    if (order.channel !== payment.channel || payment.applicationId !== binding.applicationId || payment.merchantId !== binding.merchantId || payment.environment !== binding.environment || payment.quantity !== '1' || !payment.transactionKey || payment.transactionKey.length > 255)
      return false
    if (['wechat', 'alipay'].includes(order.channel))
      return payment.merchantNo === order.merchantNo && (payment.state !== 'paid' || (payment.amountMinor === order.payableMinor && payment.currency === 'CNY'))
    return payment.productId === order.snapshot.productId && payment.bindingToken === attempt.storeToken && (order.channel !== 'google' || payment.storeAccountId === binding.storeAccountId)
  }

  private async bonus(manager: EntityManager, order: RechargeOrderEntity, date: string, now: Date, firstUser: boolean, firstDay: boolean, streak: ConsecutiveQuoteContext) {
    let points = order.snapshot.guaranteedBonusPoints
    let candidates = order.snapshot.conditionalBonuses.filter(item => item.rules.eligibility === 'always' || (item.rules.eligibility === 'first_user' ? firstUser : firstDay))
      .filter(item => new Date(item.startsAt) <= now && new Date(item.endsAt) > now)
      .map(item => ({ item, points: calculateQuote(order.snapshot.priceMinor, order.snapshot.basePoints, [item], streak).bonusPoints }))
      .filter(item => BigInt(item.points) > BigInt(points))
      .sort((a, b) => BigInt(a.points) === BigInt(b.points) ? b.item.rules.priority - a.item.rules.priority || (BigInt(a.item.id) < BigInt(b.item.id) ? -1 : 1) : BigInt(a.points) > BigInt(b.points) ? -1 : 1)
    const coupons = new Map<string, CouponEntity>()
    for (const candidate of candidates.filter(item => item.item.couponId)) {
      const coupon = await manager.getRepository(CouponEntity).findOneByOrFail({ id: candidate.item.couponId!, tenantId: '1' })
      if (coupon.startsAt <= now && coupon.endsAt > now && (coupon.userId === null || coupon.userId === order.userId))
        coupons.set(coupon.id, coupon)
    }
    candidates = candidates.filter(item => !item.item.couponId || coupons.has(item.item.couponId))
    const demands = (promotion: ApplicablePromotion, amount: string) => [
      ...this.bonusDemands(order, date, promotion, amount),
      ...(promotion.couponId ? [{ resourceKey: `coupon:${promotion.couponId}:total`, periodKey: 'lifetime', limit: coupons.get(promotion.couponId)!.totalLimit, amount: '1' }] : []),
    ]
    const locks = new Map<string, Awaited<ReturnType<CatalogService['lockPromotion']>>>()
    for (const id of [...new Set(candidates.map(item => item.item.id))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1))
      locks.set(id, await this.catalog.lockPromotion(manager, id, 'pessimistic_read'))
    const held = await manager.getRepository(OrderReservationEntity).findBy({ orderId: order.id, status: 'held' })
    await this.quotas.lockForSettlement(manager, candidates.flatMap(item => demands(item.item, item.points)), held)
    for (const candidate of candidates) {
      const stable = locks.get(candidate.item.id)!
      if (stable.status !== 'enabled')
        continue
      const current = await manager.getRepository(PromotionVersionEntity).findOneByOrFail({ promotionId: stable.id, revision: stable.currentRevision })
      if (current.startsAt > now || current.endsAt <= now)
        continue
      const rules = { ...candidate.item.rules }
      for (const field of ['totalUses', 'userTotalUses', 'userDailyUses', 'pointsBudget'] as const) {
        const latest = current.rules[field]
        if (latest !== null && (rules[field] === null || BigInt(latest) < BigInt(rules[field]!)))
          rules[field] = latest
      }
      if (BigInt(order.snapshot.basePoints) + BigInt(order.snapshot.giftPoints) + BigInt(candidate.points) > PG_BIGINT_MAX)
        continue
      await manager.query('SAVEPOINT optional_bonus')
      try {
        const reserved = await this.quotas.reserve(manager, demands({ ...candidate.item, rules }, candidate.points))
        await manager.getRepository(OrderReservationEntity).insert(reserved.map(item => ({ orderId: order.id, bucketId: item.bucketId, amount: item.amount, purpose: 'settlement' as const, status: 'held' as const })))
        // 新活动预算成功后，才释放原保证赠分预占；失败时仍兑现原保证权益。
        const old = await manager.getRepository(OrderReservationEntity).findBy({ orderId: order.id, status: 'held', purpose: 'bonus' })
        await this.quotas.finish(manager, old, 'release')
        for (const row of old)
          await manager.getRepository(OrderReservationEntity).update(row.id, { status: 'released' })
        await manager.query('RELEASE SAVEPOINT optional_bonus')
        points = candidate.points
        break
      }
      catch (error) {
        await manager.query('ROLLBACK TO SAVEPOINT optional_bonus')
        await manager.query('RELEASE SAVEPOINT optional_bonus')
        if (!(error instanceof ConflictException))
          throw error
      }
    }
    return points
  }

  private bonusDemands(order: RechargeOrderEntity, date: string, promotion: ApplicablePromotion, points: string) {
    const { id, rules } = promotion
    return [
      { resourceKey: `promotion:${id}:total`, periodKey: 'lifetime', limit: rules.totalUses, amount: '1' },
      { resourceKey: `promotion:${id}:user:${order.userId}:total`, periodKey: 'lifetime', limit: rules.userTotalUses, amount: '1' },
      { resourceKey: `promotion:${id}:user:${order.userId}:daily`, periodKey: date, limit: rules.userDailyUses, amount: '1' },
      { resourceKey: `promotion:${id}:points`, periodKey: 'lifetime', limit: rules.pointsBudget, amount: points },
    ]
  }

  private async review(manager: EntityManager, order: RechargeOrderEntity, inboxId: string | null, reason: string) {
    if (inboxId)
      await manager.getRepository(PaymentInboxEntity).update(inboxId, { status: 'review', reason })
    // 错误凭据不能改变已有订单权益；已安全关闭后的真实迟到款保留为人工补偿。
    if (reason === 'late_payment_after_local_close')
      await manager.getRepository(RechargeOrderEntity).update(order.id, { status: 'review' })
    await this.orders.event(manager, order.id, 'payment_review', null, reason)
  }

  private async done(manager: EntityManager, inboxId: string | null) {
    if (inboxId)
      await manager.getRepository(PaymentInboxEntity).update(inboxId, { status: 'done' })
  }
}
