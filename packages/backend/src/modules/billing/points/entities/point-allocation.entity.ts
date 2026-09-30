import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'
import { PointLedgerEntity } from './point-ledger.entity.js'
import { PointLotEntity } from './point-lot.entity.js'

@Entity('biz_point_allocation')
@Index('uq_point_allocation', ['ledgerId', 'lotId'], { unique: true })
@Check('chk_point_allocation_amount', '"amount" > 0')
export class PointAllocationEntity extends BillingRecord {
  @Column({ name: 'ledger_id', type: 'bigint' })
  ledgerId: string

  @ManyToOne(() => PointLedgerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ledger_id', foreignKeyConstraintName: 'fk_point_allocation_ledger' })
  ledger: Relation<PointLedgerEntity>

  @Column({ name: 'lot_id', type: 'bigint' })
  lotId: string

  @ManyToOne(() => PointLotEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lot_id', foreignKeyConstraintName: 'fk_point_allocation_lot' })
  lot: Relation<PointLotEntity>

  @Column({ type: 'bigint' })
  amount: string
}
