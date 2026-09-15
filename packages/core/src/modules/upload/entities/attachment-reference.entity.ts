import type { Relation } from 'typeorm'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { AttachmentEntity } from './attachment.entity.js'

@Entity('sys_attachment_reference')
@Index('uq_sys_attachment_reference', ['attachmentId', 'businessType', 'businessId', 'field'], { unique: true, where: '"deleted_at" IS NULL' })
@Index('idx_sys_attachment_reference_business', ['businessType', 'businessId'])
export class AttachmentReferenceEntity extends CommonEntity {
  @Column({ name: 'attachment_id', type: 'bigint' })
  attachmentId: string

  @ManyToOne(() => AttachmentEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attachment_id' })
  attachment: Relation<AttachmentEntity>

  @Column({ name: 'business_type', type: 'varchar', length: 50 })
  businessType: string

  @Column({ name: 'business_id', type: 'varchar', length: 100 })
  businessId: string

  @Column({ type: 'varchar', length: 50 })
  field: string
}
