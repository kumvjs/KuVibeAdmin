import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { BillingRecord } from '../../shared/billing-record.js'

@Entity('biz_recharge_user_state')
@Index('uq_recharge_user_state', ['tenantId', 'userId'], { unique: true })
@Check('chk_recharge_sequence', '"settlement_sequence" >= 0')
export class RechargeUserStateEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_recharge_state_user' })
  user: Relation<SysUserEntity>

  @Column({ name: 'first_order_id', type: 'bigint', nullable: true })
  firstOrderId: string | null

  @Column({ name: 'settlement_sequence', type: 'bigint', default: '0' })
  settlementSequence: string

  @Column({ name: 'current_order_id', type: 'bigint', nullable: true })
  currentOrderId: string | null
}

@Entity('biz_recharge_user_day')
@Index('uq_recharge_user_day', ['tenantId', 'userId', 'businessDate'], { unique: true })
export class RechargeUserDayEntity extends BillingRecord {
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_recharge_day_user' })
  user: Relation<SysUserEntity>

  @Column({ name: 'business_date', type: 'date' })
  businessDate: string

  @Column({ name: 'first_order_id', type: 'bigint', nullable: true })
  firstOrderId: string | null
}
