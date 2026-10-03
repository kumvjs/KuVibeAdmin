import type { EntityManager } from 'typeorm'
import type { QuotaDemand } from '../catalog/quota.service.js'
import type { CreateOrderCommand, OrderSnapshot } from './order.types.js'
import { randomUUID } from 'node:crypto'
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { getBusinessDate } from '#/utils/time.util.js'
import { CatalogService } from '../catalog/catalog.service.js'
import { calculateQuote, PAYMENT_CHANNELS } from '../catalog/catalog.types.js'
import { ChannelProductEntity } from '../catalog/entities/channel-product.entity.js'
import { CouponEntity } from '../catalog/entities/promotion.entity.js'
import { RechargeUserStateEntity } from '../catalog/entities/recharge-user-state.entity.js'
import { QuotaService } from '../catalog/quota.service.js'
import { PG_BIGINT_MAX, positiveInteger } from '../points/points.types.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { OrderEventEntity, OrderReservationEntity } from './entities/order-reservation.entity.js'
import { RechargeOrderEntity } from './entities/recharge-order.entity.js'
import { orderFingerprint } from './order.types.js'
import { BillingOutboxService } from './outbox.service.js'

@Injectable()
export class OrdersService {
  constructor(private readonly source: DataSource, private readonly catalog: CatalogService, private readonly quotas: QuotaService, private readonly outbox: BillingOutboxService) {}

  async create(userId: string, command: CreateOrderCommand) {
    this.validate(command)
    return billingTransaction(this.source, async (manager) => {
      await this.catalog.requireUser(manager, userId)
      const state = await this.lockUserState(manager, userId)
      const hash = orderFingerprint(command)
      const existing = await manager.getRepository(RechargeOrderEntity).findOneBy({ tenantId: '1', userId, idempotencyKey: command.idempotencyKey })
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException('订单幂等键已用于不同请求')
        return this.result(existing, (await this.credits([existing], manager)).get(existing.id))
      }
      const iap = ['apple', 'google'].includes(command.channel)
      if (!iap && state.currentOrderId)
        throw new ConflictException('已有未结束的微信/支付宝订单，请查询或取消原订单')
      await this.catalog.lockPackage(manager, command.packageId, 'pessimistic_read')
      const { version } = await this.catalog.purchasablePackage(manager, command.packageId)
      if (version.id !== command.versionId)
        throw new ConflictException('套餐已改版，请重新报价确认')
      // 按稳定ID锁住已发布活动，防止计算报价后运营改版或降额。
      const lockedPromotions: { id: string }[] = await manager.query(`SELECT id::text FROM biz_promotion WHERE tenant_id=1 ORDER BY id FOR SHARE`)
      const [{ now }] = await manager.query('SELECT NOW() AS now')
      const date = getBusinessDate('Asia/Shanghai', now)
      // 首单赠分候选保留到结算再判定，避免跨午夜或内购延迟沿用下单事实。
      const candidates = await this.catalog.applicablePromotions(manager, command.packageId, command, userId, now, true, true, lockedPromotions.map(item => item.id))
      const always = candidates.filter(item => item.rules.eligibility === 'always')
      const calculated = calculateQuote(version.priceMinor, version.basePoints, always)
      if (BigInt(version.basePoints) + BigInt(version.giftPoints) + BigInt(calculateQuote(version.priceMinor, version.basePoints, candidates).bonusPoints) > PG_BIGINT_MAX)
        throw new UnprocessableEntityException('套餐与活动赠分总额超过bigint范围')
      const cash = iap ? null : candidates.find(item => item.id === calculated.cash?.id) ?? null
      const bonus = iap ? null : candidates.find(item => item.id === calculated.bonus?.id) ?? null
      if (!iap && command.payableMinor !== calculated.payableMinor)
        throw new ConflictException('支付金额已改变，请重新报价确认')
      let product: ChannelProductEntity | null = null
      if (iap) {
        product = await manager.getRepository(ChannelProductEntity).findOneBy({ id: command.channelProductId, channel: command.channel, versionId: version.id, tenantId: '1' })
        if (!product)
          throw new UnprocessableEntityException('内购商品与套餐版本不匹配')
        if (command.channel === 'google') {
          const [pending] = await manager.query(`SELECT id FROM biz_recharge_order WHERE tenant_id=1 AND user_id=$1 AND channel='google' AND status='pending' AND expires_at>clock_timestamp() AND snapshot->>'applicationId'=$2 AND snapshot->>'environment'=$3 AND snapshot->>'productId'=$4 LIMIT 1`, [userId, product.applicationId, product.environment, product.productId])
          if (pending)
            throw new ConflictException('同一Google商品已有未结束的购买意图，请继续原订单或等待30分钟名额到期')
        }
      }
      const demands: QuotaDemand[] = []
      for (const [resourceKey, periodKey, limit] of [
        [`package:${command.packageId}:total`, 'lifetime', version.totalLimit],
        [`package:${command.packageId}:daily`, date, version.dailyLimit],
        [`package:${command.packageId}:user:${userId}:total`, 'lifetime', version.userTotalLimit],
        [`package:${command.packageId}:user:${userId}:daily`, date, version.userDailyLimit],
      ] as const)
        demands.push({ resourceKey, periodKey, limit, amount: '1' })
      if (!iap) {
        for (const promotion of [cash, bonus]) {
          if (!promotion)
            continue
          const { rules, id } = promotion
          for (const [resourceKey, periodKey, limit, amount] of [
            [`promotion:${id}:total`, 'lifetime', rules.totalUses, '1'],
            [`promotion:${id}:user:${userId}:total`, 'lifetime', rules.userTotalUses, '1'],
            [`promotion:${id}:user:${userId}:daily`, date, rules.userDailyUses, '1'],
            [promotion === cash ? `promotion:${id}:cash` : `promotion:${id}:points`, 'lifetime', promotion === cash ? rules.cashBudget : rules.pointsBudget, promotion === cash ? calculated.discountMinor : calculated.bonusPoints],
          ] as const) {
            if (amount !== '0')
              demands.push({ resourceKey, periodKey, limit, amount })
          }
          if (promotion.couponId) {
            const coupon = await manager.getRepository(CouponEntity).findOneByOrFail({ id: promotion.couponId })
            demands.push({ resourceKey: `coupon:${coupon.id}:total`, periodKey: 'lifetime', limit: coupon.totalLimit, amount: '1' })
          }
        }
      }
      const reserved = await this.quotas.reserve(manager, demands)
      const snapshot: OrderSnapshot = {
        versionId: version.id,
        title: version.title,
        basePoints: version.basePoints,
        giftPoints: version.giftPoints,
        priceMinor: version.priceMinor,
        currency: iap ? null : 'CNY',
        guaranteedBonusPoints: iap ? '0' : calculated.bonusPoints,
        channelProductId: product?.id ?? null,
        applicationId: product?.applicationId ?? null,
        environment: product?.environment ?? null,
        productId: product?.productId ?? null,
        cashPromotion: cash,
        guaranteedBonus: bonus,
        conditionalBonuses: candidates.filter(item => iap || item.rules.eligibility !== 'always' || item.rules.effect === 'bonus_consecutive'),
        couponId: (cash ?? bonus)?.couponId ?? null,
      }
      const order = await manager.getRepository(RechargeOrderEntity).save({
        userId,
        packageId: command.packageId,
        merchantNo: randomUUID().replaceAll('-', ''),
        idempotencyKey: command.idempotencyKey,
        requestHash: hash,
        channel: command.channel,
        client: command.client,
        businessDate: date,
        snapshot,
        payableMinor: iap ? null : calculated.payableMinor,
        status: 'pending',
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      if (reserved.length) {
        await manager.getRepository(OrderReservationEntity).insert(reserved.map(item => ({ bucketId: item.bucketId, amount: item.amount, orderId: order.id, status: 'held' as const, purpose: item.resourceKey.startsWith('package:') ? 'package' as const : (item.resourceKey.startsWith(`promotion:${cash?.id}:`) || item.resourceKey === `coupon:${cash?.couponId}:total`) ? 'cash' as const : 'bonus' as const })))
      }
      if (!iap) {
        await manager.getRepository(RechargeUserStateEntity).update(state.id, { currentOrderId: order.id })
      }
      await this.outbox.enqueue(manager, 'order_expire', order.id, `order:${order.id}:expire`, order.expiresAt!)
      await this.event(manager, order.id, 'created', userId, '用户确认套餐版本与报价后创建订单')
      return this.result(order)
    })
  }

  async get(userId: string, id: string, admin = false) {
    positiveInteger(id, 'orderId')
    const row = await this.source.getRepository(RechargeOrderEntity).findOneBy({ id, tenantId: '1', ...(admin ? {} : { userId }) })
    if (!row)
      throw new NotFoundException('订单不存在')
    return this.result(row, (await this.credits([row])).get(row.id))
  }

  async list(userId: string, cursor?: string, limit = 20) {
    return this.page({ userId }, cursor, limit)
  }

  async listSystem(filters: { userId?: string, status?: string, channel?: string, merchantNo?: string }, cursor?: string, limit = 20) {
    if (filters.userId)
      positiveInteger(filters.userId, 'userId')
    return this.page(filters, cursor, limit)
  }

  private async page(filters: { userId?: string, status?: string, channel?: string, merchantNo?: string }, cursor?: string, limit = 20) {
    if (cursor)
      positiveInteger(cursor, 'cursor')
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new UnprocessableEntityException('分页数量必须为1到100')
    const builder = this.source.getRepository(RechargeOrderEntity).createQueryBuilder('order').where('order.tenantId=1')
    for (const key of ['userId', 'status', 'channel', 'merchantNo'] as const) {
      if (filters[key])
        builder.andWhere(`order.${key}=:${key}`, { [key]: filters[key] })
    }
    if (cursor)
      builder.andWhere('order.id < :cursor', { cursor })
    const rows = await builder.orderBy('order.id', 'DESC').take(limit + 1).getMany()
    const page = rows.slice(0, limit)
    const credits = await this.credits(page)
    return { items: page.map(row => this.result(row, credits.get(row.id))), nextCursor: rows.length > limit ? rows[limit - 1].id : null }
  }

  async cancel(userId: string, id: string) {
    positiveInteger(id, 'orderId')
    return billingTransaction(this.source, async (manager) => {
      await this.catalog.requireUser(manager, userId)
      const state = await this.lockUserState(manager, userId)
      const order = await this.lockOrder(manager, id, userId)
      if (order.status === 'closed')
        return this.result(order)
      if (['apple', 'google'].includes(order.channel))
        throw new ConflictException('内购不能在站内取消，请使用商店流程并等待服务端验真')
      if (!['pending', 'closing'].includes(order.status))
        throw new ConflictException('当前订单状态不能取消')
      if (order.paymentInitiated) {
        await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closing' })
        await this.outbox.enqueue(manager, 'order_close', id, `order:${id}:close`)
        if (order.status !== 'closing')
          await this.event(manager, id, 'close_requested', userId, '请求查单/关单，保留预占直至渠道确认')
        return this.result({ ...order, status: 'closing' })
      }
      await this.releaseReservations(manager, id)
      const [{ now }] = await manager.query('SELECT NOW() AS now')
      await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closed', closedAt: now })
      if (state.currentOrderId === id)
        await manager.getRepository(RechargeUserStateEntity).update(state.id, { currentOrderId: null })
      await this.event(manager, id, 'closed', userId, '未向支付渠道发起请求，站内安全关单')
      return this.result({ ...order, status: 'closed', closedAt: now })
    })
  }

  async expire(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    if (!order.expiresAt || !['pending', 'closing'].includes(order.status))
      return
    const [{ expired }] = await this.source.query('SELECT $1::timestamptz <= NOW() AS expired', [order.expiresAt])
    if (!expired)
      throw new Error('订单尚未到期')
    // 已停用用户仍需要完成历史订单补偿，取消方法中的活跃校验不适用于worker。
    await billingTransaction(this.source, async (manager) => {
      const state = await this.lockUserState(manager, order.userId)
      const locked = await this.lockOrder(manager, id, order.userId)
      if (!['pending', 'closing'].includes(locked.status))
        return
      if (['apple', 'google'].includes(locked.channel)) {
        await this.releaseReservations(manager, id)
        await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closed', closedAt: () => 'NOW()' })
        await this.event(manager, id, 'iap_reservation_expired', null, '内购30分钟预占到期释放；不代表商店关单，迟到款需人工核查')
        return
      }
      if (locked.paymentInitiated) {
        await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closing' })
        await this.outbox.enqueue(manager, 'order_close', id, `order:${id}:close`)
      }
      else {
        await this.releaseReservations(manager, id)
        await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closed', closedAt: () => 'NOW()' })
        if (state.currentOrderId === id)
          await manager.getRepository(RechargeUserStateEntity).update(state.id, { currentOrderId: null })
      }
      await this.event(manager, id, locked.paymentInitiated ? 'close_requested' : 'closed', null, '超时任务：已发渠道请求须先确认渠道关单')
    })
  }

  async lockUserState(manager: EntityManager, userId: string) {
    await manager.getRepository(RechargeUserStateEntity).createQueryBuilder().insert().values({ userId }).orIgnore().execute()
    return manager.getRepository(RechargeUserStateEntity).createQueryBuilder('state').where('state.tenantId=1 AND state.userId=:userId', { userId }).setLock('pessimistic_write').getOneOrFail()
  }

  async lockOrder(manager: EntityManager, id: string, userId: string) {
    const order = await manager.getRepository(RechargeOrderEntity).createQueryBuilder('order').where('order.id=:id AND order.userId=:userId AND order.tenantId=1', { id, userId }).setLock('pessimistic_write').getOne()
    if (!order)
      throw new NotFoundException('订单不存在')
    return order
  }

  async releaseReservations(manager: EntityManager, orderId: string) {
    const rows = await manager.getRepository(OrderReservationEntity).findBy({ orderId, status: 'held' })
    await this.quotas.finish(manager, rows, 'release')
    for (const row of rows)
      await manager.getRepository(OrderReservationEntity).update(row.id, { status: 'released' })
  }

  async event(manager: EntityManager, orderId: string, type: string, actorId: string | null, reason: string) {
    await manager.getRepository(OrderEventEntity).insert({ orderId, type, actorId, reason })
  }

  private async credits(rows: RechargeOrderEntity[], manager = this.source.manager) {
    const ids = rows.filter(row => row.paidLedgerId).map(row => row.id)
    if (!ids.length)
      return new Map<string, { paidLedgerId: string, giftLedgerId: string | null, basePoints: string, giftPoints: string, bonusPoints: string }>()
    const records: { orderId: string, paidLedgerId: string, giftLedgerId: string | null, basePoints: string, giftPoints: string, bonusPoints: string }[] = await manager.query(`SELECT o.id::text AS "orderId",o.paid_ledger_id::text AS "paidLedgerId",o.gift_ledger_id::text AS "giftLedgerId",p.amount::text AS "basePoints",COALESCE(g.amount,0)::text AS "giftPoints",t.bonus_points::text AS "bonusPoints" FROM biz_recharge_order o JOIN biz_point_ledger p ON p.id=o.paid_ledger_id LEFT JOIN biz_point_ledger g ON g.id=o.gift_ledger_id JOIN biz_payment_transaction t ON t.order_id=o.id WHERE o.id=ANY($1::bigint[])`, [ids])
    return new Map(records.map(({ orderId, ...credit }) => [orderId, credit]))
  }

  result(order: RechargeOrderEntity, settlement: { paidLedgerId: string, giftLedgerId: string | null, basePoints: string, giftPoints: string, bonusPoints: string } | null = null) {
    return {
      id: order.id,
      merchantNo: order.merchantNo,
      userId: order.userId,
      packageId: order.packageId,
      versionId: order.snapshot.versionId,
      channel: order.channel,
      client: order.client,
      status: order.status,
      payableMinor: order.payableMinor,
      currency: order.snapshot.currency,
      title: order.snapshot.title,
      basePoints: order.snapshot.basePoints,
      giftPoints: order.snapshot.giftPoints,
      guaranteedBonusPoints: order.snapshot.guaranteedBonusPoints,
      settlement,
      productId: order.snapshot.productId,
      channelProductId: order.snapshot.channelProductId,
      createdAt: order.createdAt.toISOString(),
      expiresAt: order.expiresAt?.toISOString() ?? null,
      settledAt: order.settledAt?.toISOString() ?? null,
      closedAt: order.closedAt?.toISOString() ?? null,
    }
  }

  private validate(command: CreateOrderCommand) {
    positiveInteger(command.packageId, 'packageId')
    positiveInteger(command.versionId, 'versionId')
    if (!PAYMENT_CHANNELS.includes(command.channel) || !['app', 'qr'].includes(command.client) || typeof command.idempotencyKey !== 'string' || !/^[\w:.-]{1,120}$/.test(command.idempotencyKey))
      throw new UnprocessableEntityException('订单渠道、客户端或幂等键无效')
    if (command.couponCode !== undefined && (typeof command.couponCode !== 'string' || !/^[\w-]{6,64}$/.test(command.couponCode)))
      throw new UnprocessableEntityException('券码格式无效')
    const iap = ['apple', 'google'].includes(command.channel)
    if (iap) {
      if (command.client !== 'app' || command.payableMinor !== undefined || command.couponCode !== undefined)
        throw new UnprocessableEntityException('内购仅支持App商品验真，不使用站内现金参数或券码')
      positiveInteger(command.channelProductId, 'channelProductId')
    }
    else {
      positiveInteger(command.payableMinor, 'payableMinor')
      const maximum = command.channel === 'wechat' ? 2147483647n : 10000000000n
      if (BigInt(command.payableMinor!) > maximum)
        throw new UnprocessableEntityException('支付金额超过渠道允许范围')
      if (command.channelProductId !== undefined)
        throw new UnprocessableEntityException('微信/支付宝不使用内购商品映射')
    }
  }
}
