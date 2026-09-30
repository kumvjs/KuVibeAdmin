import type { Relation } from 'typeorm'
import type { PaymentBinding } from '../payment.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_payment_attempt')
@Index('uq_payment_attempt_order', ['orderId'], { unique: true })
@Index('uq_payment_store_token', ['storeToken'], { unique: true })
@Check('chk_payment_attempt_status', '"status" IN (\'queued\', \'starting\', \'ready\', \'cancelled\')')
export class PaymentAttemptEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_payment_attempt_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ name: 'store_token', type: 'uuid' })
  storeToken: string

  @Column({ type: 'jsonb' })
  binding: PaymentBinding

  @Column({ type: 'varchar', length: 12, default: 'queued' })
  status: 'queued' | 'starting' | 'ready' | 'cancelled'

  @Column({ type: 'jsonb', nullable: true })
  parameters: Record<string, string> | null
}

@Entity('biz_store_identity')
@Index('uq_store_identity_user', ['tenantId', 'userId'], { unique: true })
@Index('uq_store_identity_token', ['token'], { unique: true })
export class StoreIdentityEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_store_identity_user' })
  user: Relation<SysUserEntity>

  @Column({ type: 'uuid' })
  token: string
}
