import { Column, Entity, Index } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'

@Entity('sys_attachment_audit')
@Index('idx_sys_attachment_audit_attachment', ['attachmentId', 'createdAt'])
export class AttachmentAuditEntity extends CommonEntity {
  @Column({ name: 'attachment_id', type: 'bigint' })
  attachmentId: string

  @Column({ name: 'actor_id', type: 'bigint', nullable: true })
  actorId: string | null

  @Column({ type: 'varchar', length: 40 })
  action: string
}
