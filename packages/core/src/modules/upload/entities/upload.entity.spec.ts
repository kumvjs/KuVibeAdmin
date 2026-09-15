import { DataSource } from 'typeorm'
import { AttachmentAuditEntity } from './attachment-audit.entity.js'
import { AttachmentReferenceEntity } from './attachment-reference.entity.js'
import { AttachmentEntity } from './attachment.entity.js'
import { UploadPolicyEntity } from './upload-policy.entity.js'

describe('upload entity PostgreSQL metadata', () => {
  it('builds and validates all column types without connecting to a database', async () => {
    class MetadataDataSource extends DataSource {
      async validateMetadata() { await this.buildMetadatas() }
    }
    const source = new MetadataDataSource({
      type: 'postgres',
      entities: [AttachmentEntity, AttachmentReferenceEntity, UploadPolicyEntity, AttachmentAuditEntity],
    })
    await source.validateMetadata()
    for (const metadata of source.entityMetadatas) {
      for (const column of metadata.columns)
        expect(typeof column.type).toBe('string')
    }
    const attachment = source.getMetadata(AttachmentEntity)
    expect(attachment.findColumnWithPropertyName('sizeBytes')?.type).toBe('bigint')
    expect(attachment.findColumnWithPropertyName('expiresAt')?.type).toBe('timestamptz')
    expect(source.getMetadata(AttachmentReferenceEntity).foreignKeys[0].onDelete).toBe('RESTRICT')
  })
})
