import type { Relation } from 'typeorm'
import type { PromotionRules } from '../catalog.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_promotion')
@Index('uq_promotion_code', ['tenantId', 'code'], { unique: true })
@Check('chk_promotion_status', '"status" IN (\'draft\', \'enabled\', \'disabled\')')
export class PromotionEntity extends BillingRecord {
  @Column({ type: 'varchar', length: 50 })
  code: string

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: 'draft' | 'enabled' | 'disabled'

  @Column({ name: 'current_revision', type: 'integer', default: 1 })
  currentRevision: number
}

@Entity('biz_promotion_version')
@Index('uq_promotion_version', ['promotionId', 'revision'], { unique: true })
@Check('chk_promotion_window', '"starts_at" < "ends_at" AND "revision" > 0')
export class PromotionVersionEntity extends BillingRecord {
  @Column({ name: 'promotion_id', type: 'bigint' })
  promotionId: string

  @ManyToOne(() => PromotionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'promotion_id', foreignKeyConstraintName: 'fk_promotion_version_promotion' })
  promotion: Relation<PromotionEntity>

  @Column({ type: 'integer' })
  revision: number

  @Column({ type: 'varchar', length: 100 })
  title: string

  @Column({ type: 'jsonb' })
  rules: PromotionRules

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date

  @Column({ name: 'actor_id', type: 'bigint' })
  actorId: string
}

@Entity('biz_coupon')
@Index('uq_coupon_hash', ['tenantId', 'codeHash'], { unique: true })
@Check('chk_coupon_window', '"starts_at" < "ends_at" AND ("total_limit" IS NULL OR "total_limit" >= 0)')
export class CouponEntity extends BillingRecord {
  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string

  @Column({ name: 'promotion_id', type: 'bigint' })
  promotionId: string

  @ManyToOne(() => PromotionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'promotion_id', foreignKeyConstraintName: 'fk_coupon_promotion' })
  promotion: Relation<PromotionEntity>

  @Column({ name: 'version_id', type: 'bigint' })
  versionId: string

  @ManyToOne(() => PromotionVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'version_id', foreignKeyConstraintName: 'fk_coupon_version' })
  version: Relation<PromotionVersionEntity>

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: string | null

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_coupon_user' })
  user: Relation<SysUserEntity> | null

  @Column({ name: 'total_limit', type: 'bigint', nullable: true })
  totalLimit: string | null

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date

  @Column({ name: 'actor_id', type: 'bigint' })
  actorId: string
}
