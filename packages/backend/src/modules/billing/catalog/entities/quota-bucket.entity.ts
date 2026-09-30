import { Check, Column, Entity, Index } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_quota_bucket')
@Index('uq_quota_resource', ['tenantId', 'resourceKey', 'periodKey'], { unique: true })
@Check('chk_quota_capacity', '"reserved" >= 0 AND "sold" >= 0 AND ("limit" IS NULL OR "limit" >= "reserved"::numeric + "sold"::numeric)')
export class QuotaBucketEntity extends BillingRecord {
  @Column({ name: 'resource_key', type: 'varchar', length: 255 })
  resourceKey: string

  @Column({ name: 'period_key', type: 'varchar', length: 32 })
  periodKey: string

  @Column({ type: 'bigint', nullable: true })
  limit: string | null

  @Column({ type: 'bigint', default: '0' })
  reserved: string

  @Column({ type: 'bigint', default: '0' })
  sold: string
}
