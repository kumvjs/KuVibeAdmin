import type { EntityManager } from 'typeorm'
import { AttachmentReferenceEntity } from './entities/attachment-reference.entity.js'
import { AttachmentEntity } from './entities/attachment.entity.js'

/** Trusted user-write path only: caller holds the user lock in the same transaction. */
export async function releaseUserAvatarReferences(manager: EntityManager, userId: string): Promise<void> {
  const references = manager.getRepository(AttachmentReferenceEntity)
  const business = { businessType: 'user', businessId: userId, field: 'avatar' }
  const refs = await references.findBy(business)
  refs.sort((a, b) => BigInt(a.attachmentId) < BigInt(b.attachmentId) ? -1 : 1)
  for (const ref of refs) {
    const attachments = manager.getRepository(AttachmentEntity)
    await attachments.findOne({ where: { id: ref.attachmentId }, lock: { mode: 'pessimistic_write' } })
    await references.softDelete({ id: ref.id })
    if (!await references.existsBy({ attachmentId: ref.attachmentId }))
      await attachments.update(ref.attachmentId, { expiresAt: new Date() })
  }
}
