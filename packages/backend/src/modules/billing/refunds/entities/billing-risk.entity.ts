import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_billing_risk')
@Index('uq_billing_risk_order_type', ['orderId', 'type'], { unique: true })
@Index('idx_billing_risk_user', ['userId', 'status'])
@Check('chk_billing_risk', '"gap_points" >= 0 AND "status" IN (\'open\', \'resolved\')')
export class BillingRiskEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_billing_risk_user' })
  user: Relation<SysUserEntity>

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_billing_risk_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ type: 'varchar', length: 50 })
  type: string

  @Column({ name: 'gap_points', type: 'bigint', default: '0' })
  gapPoints: string

  @Column({ type: 'varchar', length: 12, default: 'open' })
  status: 'open' | 'resolved'

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true })
  resolvedBy: string | null

  @Column({ name: 'resolution_reason', type: 'varchar', length: 500, nullable: true })
  resolutionReason: string | null

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null
}
