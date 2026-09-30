import type { Relation } from 'typeorm'
import type { PaymentChannel } from '../../catalog/catalog.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_recharge_refund')
@Index('uq_recharge_refund_key', ['orderId', 'requestKey'], { unique: true })
@Index('uq_recharge_refund_no', ['refundNo'], { unique: true })
@Index('uq_recharge_refund_active', ['orderId'], { unique: true, where: '"status" IN (\'held\', \'processing\', \'succeeded\')' })
@Check('chk_recharge_refund_amounts', '"source_points" >= 0 AND "recovered_points" >= 0 AND "gap_points" >= 0 AND ("amount_minor" IS NULL OR "amount_minor" > 0)')
@Check('chk_recharge_refund_status', '"status" IN (\'held\', \'processing\', \'succeeded\', \'failed\', \'review\') AND "kind" IN (\'manual\', \'external\')')
export class RechargeRefundEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_recharge_refund_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ name: 'request_key', type: 'varchar', length: 120 })
  requestKey: string

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string

  @Column({ name: 'refund_no', type: 'varchar', length: 32 })
  refundNo: string

  @Column({ type: 'varchar', length: 16 })
  channel: PaymentChannel

  @Column({ type: 'varchar', length: 10 })
  kind: 'manual' | 'external'

  @Column({ type: 'varchar', length: 12, default: 'held' })
  status: 'held' | 'processing' | 'succeeded' | 'failed' | 'review'

  @Column({ name: 'amount_minor', type: 'bigint', nullable: true })
  amountMinor: string | null

  @Column({ name: 'source_points', type: 'bigint' })
  sourcePoints: string

  @Column({ name: 'hold_id', type: 'bigint', nullable: true })
  holdId: string | null

  @Column({ name: 'recovered_points', type: 'bigint', default: '0' })
  recoveredPoints: string

  @Column({ name: 'gap_points', type: 'bigint', default: '0' })
  gapPoints: string

  @Column({ name: 'actor_id', type: 'bigint', nullable: true })
  actorId: string | null

  @Column({ type: 'varchar', length: 500 })
  reason: string

  @Column({ name: 'evidence_hash', type: 'varchar', length: 64, nullable: true })
  evidenceHash: string | null
}
