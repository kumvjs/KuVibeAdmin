import type { RefundCommand } from './refund.types.js'
import { createHash } from 'node:crypto'
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { QuotaBucketEntity } from '../catalog/entities/quota-bucket.entity.js'
import { BillingOutboxEntity } from '../orders/entities/billing-outbox.entity.js'
import { OrderReservationEntity } from '../orders/entities/order-reservation.entity.js'
import { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import { OrdersService } from '../orders/orders.service.js'
import { BillingOutboxService } from '../orders/outbox.service.js'
import { PaymentsService } from '../payments/payments.service.js'
import { PointAccountEntity } from '../points/entities/point-account.entity.js'
import { positiveInteger } from '../points/points.types.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { RechargeRefundEntity } from './entities/recharge-refund.entity.js'
import { ReconciliationEntity } from './entities/reconciliation.entity.js'
import { RefundsService } from './refunds.service.js'

@Injectable()
export class ReconciliationService {
  constructor(private readonly source: DataSource, private readonly orders: OrdersService, private readonly outbox: BillingOutboxService, private readonly payments: PaymentsService, private readonly refunds: RefundsService) {}

  async request(orderId: string, command: RefundCommand & { verifyChannel?: boolean, repairProjection?: boolean }, actorId: string) {
    positiveInteger(orderId, 'orderId')
    if (!/^[\w:.-]{1,120}$/.test(command.idempotencyKey) || !command.reason?.trim() || command.reason.length > 500)
      throw new ConflictException('对账须提供幂等键和人工原因')
    const verifyChannel = command.verifyChannel !== false
    const repairProjection = command.repairProjection === true
    const hash = createHash('sha256').update(JSON.stringify({ key: command.idempotencyKey, reason: command.reason, verifyChannel, actorId, ...(repairProjection ? { repairProjection: true } : {}) })).digest('hex')
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: orderId })
    return billingTransaction(this.source, async (manager) => {
      await manager.getRepository(SysUserEntity).findOneOrFail({ where: { id: hint.userId }, withDeleted: true, lock: { mode: 'pessimistic_read' } })
      await this.orders.lockUserState(manager, hint.userId)
      await this.orders.lockOrder(manager, orderId, hint.userId)
      const rows = manager.getRepository(ReconciliationEntity)
      const duplicate = await rows.findOneBy({ orderId, requestKey: command.idempotencyKey })
      if (duplicate) {
        if (duplicate.requestHash !== hash)
          throw new ConflictException('对账幂等键已用于不同操作')
        return duplicate
      }
      const row = await rows.save({ orderId, requestKey: command.idempotencyKey, requestHash: hash, actorId, reason: command.reason, verifyChannel })
      // 仅恢复本订单死信，不能抢占仍有效的worker租约；原任务凭据和业务幂等键保留。
      const inboxes = await manager.query('SELECT id::text FROM biz_payment_inbox WHERE order_id=$1 AND status=\'pending\'', [orderId])
      const refunds = await manager.query('SELECT id::text FROM biz_recharge_refund WHERE order_id=$1 AND status IN (\'held\',\'processing\')', [orderId])
      await manager.getRepository(BillingOutboxEntity).createQueryBuilder().update().set({ status: 'pending', attempts: 0, availableAt: () => 'NOW()', lastError: null }).where(`status='dead' AND ((type IN ('order_expire','payment_prepare','payment_poll','order_close') AND aggregate_id=:orderId) OR (type IN ('payment_inbox','google_consume') AND aggregate_id=ANY(:inboxes)) OR (type='refund_execute' AND aggregate_id=ANY(:refunds)))`, { orderId, inboxes: inboxes.map((item: { id: string }) => item.id), refunds: refunds.map((item: { id: string }) => item.id) }).execute()
      await this.outbox.enqueue(manager, 'reconcile', row.id, `reconcile:${row.id}`, undefined, { repairProjection: String(repairProjection) })
      await this.orders.event(manager, orderId, 'reconcile_requested', actorId, command.reason)
      return row
    })
  }

  async list(orderId: string) {
    positiveInteger(orderId, 'orderId')
    return this.source.getRepository(ReconciliationEntity).find({ where: { orderId }, order: { id: 'DESC' }, take: 100 })
  }

  async process(id: string, repairProjection = false) {
    const job = await this.source.getRepository(ReconciliationEntity).findOneByOrFail({ id })
    if (job.status !== 'pending')
      return
    // 渠道读取与领域恢复均在检查事务之外；网络未知保持pending，不伪造匹配结果。
    if (job.verifyChannel) {
      const refund = await this.source.getRepository(RechargeRefundEntity).findOne({ where: { orderId: job.orderId, kind: 'manual' }, order: { id: 'DESC' } })
      if (refund && ['held', 'processing', 'succeeded'].includes(refund.status))
        await this.refunds.verify(refund.id)
      else
        await this.payments.reconcile(job.orderId)
    }
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: job.orderId })
    await billingTransaction(this.source, async (manager) => {
      await manager.getRepository(SysUserEntity).findOneOrFail({ where: { id: hint.userId }, withDeleted: true, lock: { mode: 'pessimistic_read' } })
      await this.orders.lockUserState(manager, hint.userId)
      const order = await this.orders.lockOrder(manager, hint.id, hint.userId)
      const current = await manager.getRepository(ReconciliationEntity).findOneByOrFail({ id })
      if (current.status !== 'pending')
        return
      const reservations = await manager.getRepository(OrderReservationEntity).findBy({ orderId: order.id })
      const bucketIds = [...new Set(reservations.map(row => row.bucketId))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)
      const buckets: QuotaBucketEntity[] = []
      for (const bucketId of bucketIds)
        buckets.push(await manager.getRepository(QuotaBucketEntity).findOneOrFail({ where: { id: bucketId }, lock: { mode: 'pessimistic_write' } }))
      const account = await manager.getRepository(PointAccountEntity).findOne({ where: { userId: order.userId }, lock: { mode: 'pessimistic_write' } })
      const findings: NonNullable<ReconciliationEntity['findings']> = []
      let projection: { available: string, frozen: string, sequence: string } | null = null
      const compare = (code: string, expected: string, actual: string) => {
        if (expected !== actual)
          findings.push({ code, expected, actual })
      }
      if (!job.verifyChannel)
        findings.push({ code: 'channel_not_checked' })
      if (account) {
        const [ledger] = await manager.query('SELECT COALESCE(SUM(available_delta),0)::text AS available,COALESCE(SUM(frozen_delta),0)::text AS frozen,COUNT(*)::text AS sequence,COALESCE(MAX(sequence),0)::text AS max_sequence FROM biz_point_ledger WHERE account_id=$1', [account.id])
        compare('ledger_sequence_continuity', ledger.sequence, ledger.max_sequence)
        compare('account_ledger_available', ledger.available, account.available)
        compare('account_ledger_frozen', ledger.frozen, account.frozen)
        compare('account_ledger_sequence', ledger.sequence, account.sequence)
        const [lots] = await manager.query('SELECT COALESCE(SUM(available),0)::text AS available,COALESCE(SUM(frozen),0)::text AS frozen FROM biz_point_lot WHERE account_id=$1', [account.id])
        compare('account_lots_available', lots.available, account.available)
        compare('account_lots_frozen', lots.frozen, account.frozen)
        const [holds] = await manager.query('SELECT COALESCE(SUM(remaining),0)::text AS frozen FROM biz_point_hold WHERE account_id=$1', [account.id])
        compare('account_holds_frozen', holds.frozen, account.frozen)
        if (ledger.available === lots.available && ledger.frozen === lots.frozen && ledger.frozen === holds.frozen && ledger.sequence === ledger.max_sequence)
          projection = { available: ledger.available, frozen: ledger.frozen, sequence: ledger.sequence }
        const [detail] = await manager.query(`SELECT COUNT(*)::text AS count FROM biz_point_hold h LEFT JOIN LATERAL (SELECT COALESCE(SUM(remaining),0) AS amount FROM biz_point_hold_item WHERE hold_id=h.id) i ON true WHERE h.account_id=$1 AND h.remaining<>i.amount`, [account.id])
        compare('hold_details', '0', detail.count)
        const [alloc] = await manager.query(`SELECT COUNT(*)::text AS count FROM biz_point_ledger l LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS amount FROM biz_point_allocation WHERE ledger_id=l.id) a ON true WHERE l.account_id=$1 AND l.amount<>a.amount`, [account.id])
        compare('ledger_allocations', '0', alloc.count)
        const [replay] = await manager.query(`SELECT COUNT(*)::text AS count FROM biz_point_lot lot LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(CASE WHEN l.action IN ('grant','unfreeze') THEN a.amount WHEN l.action IN ('debit','freeze') THEN -a.amount WHEN l.action='reverse' THEN CASE WHEN original.action='grant' THEN -a.amount ELSE a.amount END ELSE 0 END),0) AS available,
          COALESCE(SUM(CASE WHEN l.action='freeze' THEN a.amount WHEN l.action IN ('capture','unfreeze') THEN -a.amount ELSE 0 END),0) AS frozen
          FROM biz_point_allocation a JOIN biz_point_ledger l ON l.id=a.ledger_id LEFT JOIN biz_point_ledger original ON original.id=l.reference_id WHERE a.lot_id=lot.id) expected ON true
          WHERE lot.account_id=$1 AND (lot.available<>expected.available OR lot.frozen<>expected.frozen)`, [account.id])
        compare('lot_allocation_replay', '0', replay.count)
        const [continuity] = await manager.query(`SELECT COUNT(*)::text AS count FROM (SELECT available_before,frozen_before,COALESCE(LAG(available_after) OVER(ORDER BY sequence),0) AS prior_available,COALESCE(LAG(frozen_after) OVER(ORDER BY sequence),0) AS prior_frozen FROM biz_point_ledger WHERE account_id=$1) l WHERE available_before<>prior_available OR frozen_before<>prior_frozen`, [account.id])
        compare('ledger_continuity', '0', continuity.count)
      }
      const transactions = await manager.query('SELECT transaction_key,bonus_points::text FROM biz_payment_transaction WHERE order_id=$1', [order.id])
      if (order.paidLedgerId) {
        compare('order_transaction', '1', transactions.length.toString())
        const ledgers = await manager.query('SELECT id::text,amount::text,action,business_type FROM biz_point_ledger WHERE id=ANY($1::bigint[])', [[order.paidLedgerId, order.giftLedgerId].filter(Boolean)])
        compare('order_paid_grant', order.snapshot.basePoints, ledgers.find((row: { id: string }) => row.id === order.paidLedgerId)?.amount ?? 'missing')
        const gift = BigInt(order.snapshot.giftPoints) + BigInt(transactions[0]?.bonus_points ?? '0')
        compare('order_gift_grant', gift.toString(), ledgers.find((row: { id: string }) => row.id === order.giftLedgerId)?.amount ?? '0')
        if (ledgers.some((row: { action: string, business_type: string }) => row.action !== 'grant' || row.business_type !== 'recharge'))
          findings.push({ code: 'order_grant_type' })
        if (order.status === 'refunded') {
          const [remaining] = await manager.query('SELECT COALESCE(SUM(available+frozen),0)::text AS amount FROM biz_point_lot WHERE grant_id=ANY($1::bigint[])', [[order.paidLedgerId, order.giftLedgerId].filter(Boolean)])
          compare('refunded_source_remaining', '0', remaining.amount)
          const [refund] = await manager.query(`SELECT COUNT(*)::text AS count FROM biz_recharge_refund WHERE order_id=$1 AND status='succeeded' AND source_points=recovered_points+gap_points`, [order.id])
          compare('refund_recovery_audit', '1', refund.count)
        }
      }
      for (const bucket of buckets) {
        const [sum] = await manager.query(`SELECT COALESCE(SUM(amount) FILTER(WHERE status='held'),0)::text AS reserved,COALESCE(SUM(amount) FILTER(WHERE status='consumed'),0)::text AS sold FROM biz_order_reservation WHERE bucket_id=$1`, [bucket.id])
        compare(`quota_reserved_${bucket.id}`, sum.reserved, bucket.reserved)
        compare(`quota_sold_${bucket.id}`, sum.sold, bucket.sold)
      }
      const differences = findings.filter(item => item.code !== 'channel_not_checked')
      const projectionCodes = new Set(['account_ledger_available', 'account_ledger_frozen', 'account_ledger_sequence', 'account_lots_available', 'account_lots_frozen', 'account_holds_frozen'])
      const repaired = repairProjection && account && projection && differences.length > 0 && differences.every(item => projectionCodes.has(item.code))
      if (repaired && account && projection) {
        await manager.getRepository(PointAccountEntity).update(account.id, projection)
        findings.push({ code: 'projection_rebuilt', expected: `${projection.available}:${projection.frozen}:${projection.sequence}`, actual: `${account.available}:${account.frozen}:${account.sequence}` })
        await this.orders.event(manager, order.id, 'projection_rebuilt', job.actorId, `${job.reason}；账户${account.id}按不可变流水/批次/冻结证据重建，保留原差异；不变更流水或来源权益`)
      }
      if (differences.length && !repaired)
        await this.refunds.risk(manager, order, `reconcile_${id}`, 0n)
      await manager.getRepository(ReconciliationEntity).update(id, { status: differences.length && !repaired ? 'review' : 'done', findings, completedAt: () => 'NOW()' })
      await this.orders.event(manager, order.id, 'reconciled', job.actorId, repaired ? '账户投影已按证据重建；原风险仍需人工审计处置' : differences.length ? `发现${differences.length}项差异，保留审计并限制消费；禁止无证据改余额` : job.verifyChannel ? '渠道事实和积分/批次/冻结/订单/额度一致' : '站内账务一致；本次明确未检查渠道')
    })
  }
}
