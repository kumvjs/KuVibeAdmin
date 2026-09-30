import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_billing_reconciliation')
@Index('uq_billing_reconciliation_key', ['orderId', 'requestKey'], { unique: true })
@Check('chk_billing_reconciliation_status', '"status" IN (\'pending\', \'done\', \'review\')')
export class ReconciliationEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_billing_reconciliation_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ name: 'request_key', type: 'varchar', length: 120 })
  requestKey: string

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string

  @Column({ name: 'actor_id', type: 'bigint' })
  actorId: string

  @Column({ type: 'varchar', length: 500 })
  reason: string

  @Column({ name: 'verify_channel', type: 'boolean', default: true })
  verifyChannel: boolean

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: 'pending' | 'done' | 'review'

  @Column({ type: 'jsonb', nullable: true })
  findings: { code: string, expected?: string, actual?: string }[] | null

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null
}
