import type { EntityManager } from 'typeorm'
import { Injectable } from '@nestjs/common'

export interface AttachmentBusiness {
  businessType: string
  businessId: string
  field: string
}

export interface AttachmentBusinessHandler {
  purpose: string
  canRead: (manager: EntityManager, business: AttachmentBusiness, userId: string) => Promise<boolean>
  canBind: (manager: EntityManager, business: AttachmentBusiness, userId: string) => Promise<boolean>
  isPublic?: (manager: EntityManager, business: AttachmentBusiness, attachmentId: string) => Promise<boolean>
}

/** Registration is server-only. There is intentionally no generic client binding endpoint. */
@Injectable()
export class AttachmentBusinessRegistry {
  private readonly handlers = new Map<string, AttachmentBusinessHandler>()

  register(type: string, handler: AttachmentBusinessHandler): void {
    if (this.handlers.has(type))
      throw new Error(`Attachment business handler already registered: ${type}`)
    this.handlers.set(type, handler)
  }

  get(type: string): AttachmentBusinessHandler | undefined {
    return this.handlers.get(type)
  }
}
