import { Check, Column, Entity, Index } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'

@Entity('sys_attachment')
@Index('uq_sys_attachment_object', ['storageDriver', 'objectKey'], { unique: true })
@Index('idx_sys_attachment_cleanup', ['status', 'expiresAt'])
@Index('idx_sys_attachment_owner', ['ownerId', 'createdAt'])
@Check('chk_sys_attachment_size', '"size_bytes" >= 0')
@Check('chk_sys_attachment_visibility', '"visibility" IN (\'private\', \'public\')')
@Check('chk_sys_attachment_status', '"status" IN (\'pending\', \'ready\', \'deleting\', \'deleted\')')
@Check('chk_sys_attachment_scan', '"scan_status" IN (\'unscanned\', \'clean\', \'rejected\')')
export class AttachmentEntity extends CommonEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId: string

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string

  @Column({ type: 'varchar', length: 20 })
  extension: string

  @Column({ name: 'mime_type', type: 'varchar', length: 127 })
  mimeType: string

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string

  @Column({ type: 'varchar', length: 64 })
  sha256: string

  @Column({ name: 'storage_driver', type: 'varchar', length: 20 })
  storageDriver: string

  @Column({ name: 'object_key', type: 'varchar', length: 255 })
  objectKey: string

  @Column({ type: 'varchar', length: 50 })
  @Index('idx_sys_attachment_purpose')
  purpose: string

  @Column({ name: 'policy_revision', type: 'integer' })
  policyRevision: number

  @Column({ type: 'varchar', length: 7, default: 'private' })
  visibility: 'private' | 'public'

  @Column({ type: 'varchar', length: 8, default: 'pending' })
  status: 'pending' | 'ready' | 'deleting' | 'deleted'

  @Column({ name: 'scan_status', type: 'varchar', length: 9, default: 'unscanned' })
  scanStatus: 'unscanned' | 'clean' | 'rejected'

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null
}
