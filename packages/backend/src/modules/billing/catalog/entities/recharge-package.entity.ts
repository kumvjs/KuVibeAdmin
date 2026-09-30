import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_recharge_package')
@Index('uq_recharge_package_code', ['tenantId', 'code'], { unique: true })
@Check('chk_recharge_package_status', '"status" IN (\'draft\', \'enabled\', \'disabled\')')
export class RechargePackageEntity extends BillingRecord {
  @Column({ type: 'varchar', length: 50 })
  code: string

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: 'draft' | 'enabled' | 'disabled'

  @Column({ name: 'current_revision', type: 'integer', default: 1 })
  currentRevision: number
}

@Entity('biz_package_version')
@Index('uq_package_version', ['packageId', 'revision'], { unique: true })
@Check('chk_package_version_amount', '"price_minor" > 0 AND "base_points" > 0 AND "gift_points" >= 0 AND "revision" > 0')
@Check('chk_package_version_limits', '("total_limit" IS NULL OR "total_limit" >= 0) AND ("daily_limit" IS NULL OR "daily_limit" >= 0) AND ("user_total_limit" IS NULL OR "user_total_limit" >= 0) AND ("user_daily_limit" IS NULL OR "user_daily_limit" >= 0)')
@Check('chk_package_version_window', '"starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"')
export class PackageVersionEntity extends BillingRecord {
  @Column({ name: 'package_id', type: 'bigint' })
  packageId: string

  @ManyToOne(() => RechargePackageEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'package_id', foreignKeyConstraintName: 'fk_package_version_package' })
  package: Relation<RechargePackageEntity>

  @Column({ type: 'integer' })
  revision: number

  @Column({ type: 'varchar', length: 100 })
  title: string

  @Column({ name: 'price_minor', type: 'bigint' })
  priceMinor: string

  @Column({ name: 'base_points', type: 'bigint' })
  basePoints: string

  @Column({ name: 'gift_points', type: 'bigint', default: '0' })
  giftPoints: string

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null

  @Column({ name: 'total_limit', type: 'bigint', nullable: true })
  totalLimit: string | null

  @Column({ name: 'daily_limit', type: 'bigint', nullable: true })
  dailyLimit: string | null

  @Column({ name: 'user_total_limit', type: 'bigint', nullable: true })
  userTotalLimit: string | null

  @Column({ name: 'user_daily_limit', type: 'bigint', nullable: true })
  userDailyLimit: string | null

  @Column({ name: 'actor_id', type: 'bigint' })
  actorId: string
}
