import type { Relation } from 'typeorm'
import type { PaymentChannel } from '../../catalog/catalog.types.js'
import type { OrderSnapshot, OrderStatus } from '../order.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, UpdateDateColumn } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { RechargePackageEntity } from '../../catalog/entities/recharge-package.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_recharge_order')
@Index('uq_recharge_order_key', ['tenantId', 'userId', 'idempotencyKey'], { unique: true })
@Index('uq_recharge_merchant_no', ['merchantNo'], { unique: true })
@Index('idx_recharge_order_user', ['tenantId', 'userId', 'id'])
@Index('idx_recharge_order_expiry', ['status', 'expiresAt'])
@Check('chk_order_status', '"status" IN (\'pending\', \'closing\', \'closed\', \'paid\', \'refund_pending\', \'refunded\', \'review\')')
@Check('chk_order_channel', '"channel" IN (\'wechat\', \'alipay\', \'apple\', \'google\') AND "client" IN (\'app\', \'qr\')')
@Check('chk_order_amount', '"payable_minor" IS NULL OR "payable_minor" > 0')
export class RechargeOrderEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_recharge_order_user' })
  user: Relation<SysUserEntity>

  @Column({ name: 'package_id', type: 'bigint' })
  packageId: string

  @ManyToOne(() => RechargePackageEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'package_id', foreignKeyConstraintName: 'fk_recharge_order_package' })
  package: Relation<RechargePackageEntity>

  @Column({ name: 'merchant_no', type: 'varchar', length: 32 })
  merchantNo: string

  @Column({ name: 'idempotency_key', type: 'varchar', length: 120 })
  idempotencyKey: string

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string

  @Column({ type: 'varchar', length: 16 })
  channel: PaymentChannel

  @Column({ type: 'varchar', length: 8 })
  client: 'app' | 'qr'

  @Column({ name: 'business_date', type: 'date' })
  businessDate: string

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: OrderStatus

  @Column({ name: 'payable_minor', type: 'bigint', nullable: true })
  payableMinor: string | null

  @Column({ type: 'jsonb' })
  snapshot: OrderSnapshot

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null

  @Column({ name: 'payment_initiated', type: 'boolean', default: false })
  paymentInitiated: boolean

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt: Date | null

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null

  @Column({ name: 'paid_ledger_id', type: 'bigint', nullable: true })
  paidLedgerId: string | null

  @Column({ name: 'gift_ledger_id', type: 'bigint', nullable: true })
  giftLedgerId: string | null

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
