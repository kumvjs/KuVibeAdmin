import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { QuotaBucketEntity } from '../../catalog/entities/quota-bucket.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'
import { RechargeOrderEntity } from './recharge-order.entity.js'

@Entity('biz_order_reservation')
@Index('uq_order_reservation', ['orderId', 'bucketId'], { unique: true })
@Check('chk_order_reservation', '"amount" > 0 AND "status" IN (\'held\', \'consumed\', \'released\') AND "purpose" IN (\'package\', \'cash\', \'bonus\', \'settlement\')')
export class OrderReservationEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_order_reservation_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ name: 'bucket_id', type: 'bigint' })
  bucketId: string

  @ManyToOne(() => QuotaBucketEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bucket_id', foreignKeyConstraintName: 'fk_order_reservation_bucket' })
  bucket: Relation<QuotaBucketEntity>

  @Column({ type: 'bigint' })
  amount: string

  @Column({ type: 'varchar', length: 16 })
  purpose: 'package' | 'cash' | 'bonus' | 'settlement'

  @Column({ type: 'varchar', length: 12, default: 'held' })
  status: 'held' | 'consumed' | 'released'
}

@Entity('biz_order_event')
@Index('idx_order_event_order', ['orderId', 'id'])
export class OrderEventEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_order_event_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ type: 'varchar', length: 50 })
  type: string

  @Column({ name: 'actor_id', type: 'bigint', nullable: true })
  actorId: string | null

  @Column({ type: 'varchar', length: 500 })
  reason: string
}
