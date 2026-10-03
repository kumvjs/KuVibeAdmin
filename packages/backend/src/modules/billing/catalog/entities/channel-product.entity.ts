import type { Relation } from 'typeorm'
import type { PaymentChannel } from '../catalog.types.js'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BillingRecord } from '../../shared/billing-record.js'
import { PackageVersionEntity } from './recharge-package.entity.js'

@Entity('biz_channel_product')
@Index('uq_channel_product', ['versionId', 'channel', 'applicationId', 'environment', 'productId'], { unique: true })
@Check('chk_channel_product_kind', '"channel" IN (\'apple\', \'google\') AND "environment" IN (\'sandbox\', \'production\')')
export class ChannelProductEntity extends BillingRecord {
  @Column({ name: 'version_id', type: 'bigint' })
  versionId: string

  @ManyToOne(() => PackageVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'version_id', foreignKeyConstraintName: 'fk_channel_product_version' })
  version: Relation<PackageVersionEntity>

  @Column({ type: 'varchar', length: 16 })
  channel: PaymentChannel

  @Column({ name: 'application_id', type: 'varchar', length: 255 })
  applicationId: string

  @Column({ type: 'varchar', length: 16 })
  environment: 'sandbox' | 'production'

  @Column({ name: 'product_id', type: 'varchar', length: 255 })
  productId: string

  @Column({ name: 'actor_id', type: 'bigint' })
  actorId: string
}
