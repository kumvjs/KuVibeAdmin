import type { EntityManager } from 'typeorm'
import type { ProviderPayment } from './payment.types.js'
import { ConflictException } from '@nestjs/common'
import { PaymentTransactionEntity } from './entities/payment-transaction.entity.js'

/** 适配器验真之后调用，通知日志不能替代交易级持久化和去重。 */
export async function recordPayment(manager: EntityManager, payment: ProviderPayment, inboxId: string | null) {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${payment.channel}:${payment.transactionKey}`])
  const rows = manager.getRepository(PaymentTransactionEntity)
  let row = await rows.findOneBy({ channel: payment.channel, transactionKey: payment.transactionKey, tenantId: '1' })
  if (!row)
    return rows.save({ channel: payment.channel, transactionKey: payment.transactionKey, orderId: null, facts: payment, latestFacts: payment, inboxId, bonusPoints: '0', status: 'unmatched', reason: 'missing_store_order_binding' })
  const original = row.facts
  if (original.applicationId !== payment.applicationId || original.environment !== payment.environment || original.merchantId !== payment.merchantId || (original.productId !== null && payment.productId !== null && original.productId !== payment.productId))
    throw new ConflictException('平台交易身份与原验真事实矛盾')
  const previous = row.latestFacts ?? original
  // 退款终态不能被旧付款通知逆转；已确认付款也不能回退为待付款/取消。
  const stale = (previous.state === 'refunded' && payment.state !== 'refunded')
    || (previous.state === 'paid' && ['pending', 'closed'].includes(payment.state))
    || (previous.state === 'closed' && payment.state === 'pending')
    || (previous.state === 'refunded' && previous.refundScope === 'full' && payment.refundScope === 'partial')
  const enriched = { ...payment, platformAmount: payment.platformAmount ?? previous.platformAmount, currency: payment.currency ?? previous.currency, platformOrderId: payment.platformOrderId ?? previous.platformOrderId }
  const latestFacts = stale
    ? { ...previous, platformAmount: enriched.platformAmount, currency: enriched.currency, platformOrderId: enriched.platformOrderId }
    : payment.state === 'refunded'
      ? { ...enriched, productId: payment.productId ?? previous.productId, bindingToken: payment.bindingToken ?? previous.bindingToken, storeAccountId: payment.storeAccountId ?? previous.storeAccountId }
      : enriched
  await rows.update(row.id, { latestFacts, verifiedAt: () => 'clock_timestamp()' })
  row = { ...row, latestFacts }
  return row
}
