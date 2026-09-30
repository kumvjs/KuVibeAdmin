import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'
import { PointAccountEntity } from './point-account.entity.js'
import { PointLedgerEntity } from './point-ledger.entity.js'
import { PointLotEntity } from './point-lot.entity.js'

@Entity('biz_point_hold')
@Index('uq_point_hold_ledger', ['ledgerId'], { unique: true })
@Check('chk_point_hold_amount', '"remaining" >= 0 AND "remaining" <= "initial" AND "initial" > 0')
export class PointHoldEntity extends BillingRecord {
  @Column({ name: 'account_id', type: 'bigint' })
  accountId: string

  @ManyToOne(() => PointAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id', foreignKeyConstraintName: 'fk_point_hold_account' })
  account: Relation<PointAccountEntity>

  @Column({ name: 'ledger_id', type: 'bigint' })
  ledgerId: string

  @ManyToOne(() => PointLedgerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ledger_id', foreignKeyConstraintName: 'fk_point_hold_ledger' })
  ledger: Relation<PointLedgerEntity>

  @Column({ type: 'bigint' })
  initial: string

  @Column({ type: 'bigint' })
  remaining: string
}

@Entity('biz_point_hold_item')
@Index('uq_point_hold_item', ['holdId', 'lotId'], { unique: true })
@Check('chk_point_hold_item_amount', '"remaining" >= 0 AND "remaining" <= "initial" AND "initial" > 0')
export class PointHoldItemEntity extends BillingRecord {
  @Column({ name: 'hold_id', type: 'bigint' })
  holdId: string

  @ManyToOne(() => PointHoldEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'hold_id', foreignKeyConstraintName: 'fk_point_hold_item_hold' })
  hold: Relation<PointHoldEntity>

  @Column({ name: 'lot_id', type: 'bigint' })
  lotId: string

  @ManyToOne(() => PointLotEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lot_id', foreignKeyConstraintName: 'fk_point_hold_item_lot' })
  lot: Relation<PointLotEntity>

  @Column({ type: 'bigint' })
  initial: string

  @Column({ type: 'bigint' })
  remaining: string
}
