import type { Relation } from 'typeorm'
import type { PointKind } from '../points.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'
import { PointAccountEntity } from './point-account.entity.js'
import { PointLedgerEntity } from './point-ledger.entity.js'

@Entity('biz_point_lot')
@Index('idx_point_lot_account', ['accountId', 'kind', 'id'])
@Index('uq_point_lot_grant', ['grantId'], { unique: true })
@Check('chk_point_lot_amount', '"initial" > 0 AND "available" >= 0 AND "frozen" >= 0 AND "available" + "frozen" <= "initial"')
@Check('chk_point_lot_kind', '"kind" IN (\'paid\', \'gift\')')
export class PointLotEntity extends BillingRecord {
  @Column({ name: 'account_id', type: 'bigint' })
  accountId: string

  @ManyToOne(() => PointAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id', foreignKeyConstraintName: 'fk_point_lot_account' })
  account: Relation<PointAccountEntity>

  @Column({ name: 'grant_id', type: 'bigint' })
  grantId: string

  @ManyToOne(() => PointLedgerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'grant_id', foreignKeyConstraintName: 'fk_point_lot_grant' })
  grant: Relation<PointLedgerEntity>

  @Column({ type: 'varchar', length: 8 })
  kind: PointKind

  @Column({ type: 'bigint' })
  initial: string

  @Column({ type: 'bigint' })
  available: string

  @Column({ type: 'bigint', default: '0' })
  frozen: string
}
