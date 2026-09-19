import { Check, Column, Entity, Index, VersionColumn } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'

@Entity('sys_upload_policy')
@Index('uq_sys_upload_policy_purpose', ['purpose'], { unique: true })
@Check('chk_sys_upload_policy_limits', '"max_file_bytes" > 0 AND "max_total_bytes" >= "max_file_bytes" AND "max_total_bytes" <= 1073741824 AND "max_files" BETWEEN 1 AND 20 AND "retention_seconds" BETWEEN 60 AND 2592000')
@Check('chk_sys_upload_policy_visibility', '"visibility" IN (\'private\', \'public\') AND ("visibility" = \'private\' OR "purpose" = \'avatar\')')
@Check('chk_sys_upload_policy_formats', 'jsonb_typeof("allowed_formats") = \'array\' AND jsonb_array_length("allowed_formats") BETWEEN 1 AND 13')
export class UploadPolicyEntity extends CommonEntity {
  @Column({ name: 'max_image_width', type: 'integer', nullable: true })
  maxImageWidth: number | null

  @Column({ name: 'max_image_height', type: 'integer', nullable: true })
  maxImageHeight: number | null

  @Column({ type: 'varchar', length: 50 })
  purpose: string

  @Column({ type: 'boolean', default: false })
  enabled: boolean

  @Column({ name: 'allowed_formats', type: 'jsonb' })
  allowedFormats: string[]

  @Column({ name: 'max_file_bytes', type: 'integer' })
  maxFileBytes: number

  @Column({ name: 'max_total_bytes', type: 'integer' })
  maxTotalBytes: number

  @Column({ name: 'max_files', type: 'smallint' })
  maxFiles: number

  @Column({ type: 'varchar', length: 7, default: 'private' })
  visibility: 'private' | 'public'

  @Column({ name: 'retention_seconds', type: 'integer' })
  retentionSeconds: number

  @VersionColumn({ type: 'integer' })
  revision: number
}
