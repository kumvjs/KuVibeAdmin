import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'
import { RechargePackageEntity } from './recharge-package.entity.js'

@Entity('biz_recharge_package_streak')
@Index('uq_recharge_package_streak', ['tenantId', 'userId', 'packageId'], { unique: true })
@Check('chk_recharge_streak_days', '"consecutive_days" > 0')
export class RechargePackageStreakEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_recharge_streak_user' })
  user: Relation<SysUserEntity>

  @Column({ name: 'package_id', type: 'bigint' })
  packageId: string

  @ManyToOne(() => RechargePackageEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'package_id', foreignKeyConstraintName: 'fk_recharge_streak_package' })
  package: Relation<RechargePackageEntity>

  @Column({ name: 'last_business_date', type: 'date' })
  lastBusinessDate: string

  @Column({ name: 'consecutive_days', type: 'integer' })
  consecutiveDays: number
}
