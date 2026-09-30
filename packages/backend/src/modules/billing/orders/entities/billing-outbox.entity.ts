import { Check, Column, Entity, Index } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_billing_outbox')
@Index('uq_billing_outbox_key', ['tenantId', 'type', 'businessKey'], { unique: true })
@Index('idx_billing_outbox_due', ['status', 'availableAt'])
@Check('chk_billing_outbox_status', '"status" IN (\'pending\', \'processing\', \'done\', \'dead\') AND "attempts" >= 0')
@Check('chk_billing_outbox_lease', '("status" = \'processing\' AND "lease_token" IS NOT NULL AND "leased_until" IS NOT NULL) OR ("status" <> \'processing\' AND "lease_token" IS NULL AND "leased_until" IS NULL)')
export class BillingOutboxEntity extends BillingRecord {
  @Column({ type: 'varchar', length: 50 })
  type: string

  @Column({ name: 'business_key', type: 'varchar', length: 120 })
  businessKey: string

  @Column({ name: 'aggregate_id', type: 'bigint' })
  aggregateId: string

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, string>

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: 'pending' | 'processing' | 'done' | 'dead'

  @Column({ type: 'integer', default: 0 })
  attempts: number

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  availableAt: Date

  @Column({ name: 'lease_token', type: 'uuid', nullable: true })
  leaseToken: string | null

  @Column({ name: 'leased_until', type: 'timestamptz', nullable: true })
  leasedUntil: Date | null

  @Column({ name: 'last_error', type: 'varchar', length: 100, nullable: true })
  lastError: string | null
}
