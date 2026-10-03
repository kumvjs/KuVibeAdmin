import type { Relation } from 'typeorm'
import type { ProviderPayment } from '../payment.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

/** Google使用token哈希，Apple使用环境/应用/transactionId；不依赖可缺失的Google orderId。 */
@Entity('biz_payment_transaction')
@Index('uq_payment_transaction_key', ['channel', 'transactionKey'], { unique: true })
@Index('uq_payment_transaction_order', ['orderId'], { unique: true })
@Index('idx_payment_transaction_status', ['status', 'id'])
@Check('chk_payment_transaction_status', '"status" IN (\'unmatched\', \'matched\', \'fulfilled\', \'review\') AND ("status" NOT IN (\'matched\', \'fulfilled\') OR "order_id" IS NOT NULL)')
export class PaymentTransactionEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint', nullable: true })
  orderId: string | null

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_payment_transaction_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ type: 'varchar', length: 16 })
  channel: ProviderPayment['channel']

  @Column({ name: 'transaction_key', type: 'varchar', length: 255 })
  transactionKey: string

  @Column({ type: 'jsonb' })
  facts: ProviderPayment

  /** 首次事实不可变；最新验真只维护平台状态，不能覆盖原交易身份。 */
  @Column({ name: 'latest_facts', type: 'jsonb', nullable: true })
  latestFacts: ProviderPayment | null

  @Column({ type: 'varchar', length: 12, default: 'unmatched' })
  status: 'unmatched' | 'matched' | 'fulfilled' | 'review'

  @Column({ type: 'varchar', length: 100, nullable: true })
  reason: string | null

  @Column({ name: 'verified_at', type: 'timestamptz', default: () => 'now()' })
  verifiedAt: Date

  @Column({ name: 'manual_binding', type: 'jsonb', nullable: true })
  manualBinding: { orderId: string, actorId: string, reason: string } | null

  @Column({ name: 'inbox_id', type: 'bigint', nullable: true })
  inboxId: string | null

  @Column({ name: 'bonus_points', type: 'bigint' })
  bonusPoints: string
}
