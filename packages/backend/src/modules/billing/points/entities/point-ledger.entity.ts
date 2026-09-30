import type { Relation } from 'typeorm'
import type { PointAction } from '../points.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'
import { PointAccountEntity } from './point-account.entity.js'

@Entity('biz_point_ledger')
@Index('uq_point_ledger_sequence', ['accountId', 'sequence'], { unique: true })
@Index('uq_point_ledger_business', ['tenantId', 'businessType', 'businessKey'], { unique: true })
@Index('uq_point_ledger_reverse', ['referenceId'], { unique: true, where: '"action" = \'reverse\'' })
@Check('chk_point_ledger_amount', '"amount" > 0')
@Check('chk_point_ledger_action', '"action" IN (\'grant\', \'debit\', \'freeze\', \'capture\', \'unfreeze\', \'reverse\')')
@Check('chk_point_ledger_math', '"available_after" = "available_before" + "available_delta" AND "frozen_after" = "frozen_before" + "frozen_delta" AND "available_after" >= 0 AND "frozen_after" >= 0')
export class PointLedgerEntity extends BillingRecord {
  @Column({ name: 'account_id', type: 'bigint' })
  accountId: string

  @ManyToOne(() => PointAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id', foreignKeyConstraintName: 'fk_point_ledger_account' })
  account: Relation<PointAccountEntity>

  @Column({ type: 'bigint' })
  sequence: string

  @Column({ type: 'varchar', length: 16 })
  action: PointAction

  @Column({ type: 'bigint' })
  amount: string

  @Column({ name: 'available_delta', type: 'bigint' })
  availableDelta: string

  @Column({ name: 'frozen_delta', type: 'bigint' })
  frozenDelta: string

  @Column({ name: 'available_before', type: 'bigint' })
  availableBefore: string

  @Column({ name: 'available_after', type: 'bigint' })
  availableAfter: string

  @Column({ name: 'frozen_before', type: 'bigint' })
  frozenBefore: string

  @Column({ name: 'frozen_after', type: 'bigint' })
  frozenAfter: string

  @Column({ name: 'business_type', type: 'varchar', length: 50 })
  businessType: string

  @Column({ name: 'business_key', type: 'varchar', length: 150 })
  businessKey: string

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string

  @Column({ type: 'varchar', length: 500 })
  reason: string

  @Column({ name: 'actor_id', type: 'bigint', nullable: true })
  actorId: string | null

  @Column({ name: 'reference_id', type: 'bigint', nullable: true })
  referenceId: string | null

  @ManyToOne(() => PointLedgerEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reference_id', foreignKeyConstraintName: 'fk_point_ledger_reference' })
  reference: Relation<PointLedgerEntity> | null

  @Column({ name: 'hold_id', type: 'bigint', nullable: true })
  holdId: string | null

  @Column({ name: 'trace_id', type: 'varchar', length: 128, nullable: true })
  traceId: string | null
}
