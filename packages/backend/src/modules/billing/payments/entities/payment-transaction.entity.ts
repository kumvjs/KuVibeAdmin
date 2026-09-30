import type { Relation } from 'typeorm'
import type { ProviderPayment } from '../payment.types.js'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

/** Google使用token哈希，Apple使用环境/应用/transactionId；不依赖可缺失的Google orderId。 */
@Entity('biz_payment_transaction')
@Index('uq_payment_transaction_key', ['channel', 'transactionKey'], { unique: true })
@Index('uq_payment_transaction_order', ['orderId'], { unique: true })
export class PaymentTransactionEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_payment_transaction_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ type: 'varchar', length: 16 })
  channel: ProviderPayment['channel']

  @Column({ name: 'transaction_key', type: 'varchar', length: 255 })
  transactionKey: string

  @Column({ type: 'jsonb' })
  facts: ProviderPayment

  @Column({ name: 'inbox_id', type: 'bigint', nullable: true })
  inboxId: string | null

  @Column({ name: 'bonus_points', type: 'bigint' })
  bonusPoints: string
}
