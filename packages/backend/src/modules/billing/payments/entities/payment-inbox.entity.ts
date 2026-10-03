import type { Relation } from 'typeorm'
import type { PaymentChannel } from '../../catalog/catalog.types.js'
import type { ProviderPayment } from '../payment.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { RechargeOrderEntity } from '../../orders/entities/recharge-order.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

export interface SealedSecret { keyId: string, nonce: string, ciphertext: string, tag: string }
export interface InboxPayload {
  payment?: ProviderPayment
  transactionId?: string
  secret?: SealedSecret
  notice?: SealedSecret
  applicationId?: string
  environment?: 'sandbox' | 'production'
  notificationType?: string
  refundScope?: 'full' | 'partial'
  refundNo?: string
  reportedUserId?: string
}

@Entity('biz_payment_inbox')
@Index('uq_payment_inbox_hash', ['channel', 'evidenceHash'], { unique: true })
@Index('idx_payment_inbox_order', ['orderId', 'id'])
@Check('chk_payment_inbox_status', '"status" IN (\'pending\', \'done\', \'review\')')
export class PaymentInboxEntity extends BillingRecord {
  @Column({ name: 'order_id', type: 'bigint', nullable: true })
  orderId: string | null

  @ManyToOne(() => RechargeOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'fk_payment_inbox_order' })
  order: Relation<RechargeOrderEntity>

  @Column({ type: 'varchar', length: 16 })
  channel: PaymentChannel

  @Column({ name: 'evidence_hash', type: 'varchar', length: 64 })
  evidenceHash: string

  @Column({ type: 'jsonb' })
  payload: InboxPayload

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: 'pending' | 'done' | 'review'

  @Column({ type: 'varchar', length: 100, nullable: true })
  reason: string | null
}
