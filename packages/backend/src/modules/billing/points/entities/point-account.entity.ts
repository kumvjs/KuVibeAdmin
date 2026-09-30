import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, UpdateDateColumn } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_point_account')
@Index('uq_point_account_user', ['tenantId', 'userId'], { unique: true })
@Check('chk_point_account_balance', '"available" >= 0 AND "frozen" >= 0 AND "sequence" >= 0')
@Check('chk_point_account_status', '"status" IN (\'active\', \'blocked\')')
export class PointAccountEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_point_account_user' })
  user: Relation<SysUserEntity>

  @Column({ type: 'bigint', default: '0' })
  available: string

  @Column({ type: 'bigint', default: '0' })
  frozen: string

  @Column({ type: 'bigint', default: '0' })
  sequence: string

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'blocked'

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
