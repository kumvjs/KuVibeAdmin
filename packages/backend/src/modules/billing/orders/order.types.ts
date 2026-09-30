import type { ApplicablePromotion } from '../catalog/catalog.service.js'
import type { PaymentChannel } from '../catalog/catalog.types.js'
import { createHash } from 'node:crypto'

export const ORDER_PERMISSIONS = { READ: 'system:billing:order:read', RECONCILE: 'system:billing:order:reconcile', REFUND: 'system:billing:order:refund' } as const
export type OrderStatus = 'pending' | 'closing' | 'closed' | 'paid' | 'refund_pending' | 'refunded' | 'review'

export interface OrderSnapshot {
  versionId: string
  title: string
  basePoints: string
  giftPoints: string
  guaranteedBonusPoints: string
  priceMinor: string
  currency: 'CNY' | null
  channelProductId: string | null
  applicationId: string | null
  environment: 'sandbox' | 'production' | null
  productId: string | null
  cashPromotion: ApplicablePromotion | null
  guaranteedBonus: ApplicablePromotion | null
  conditionalBonuses: ApplicablePromotion[]
  couponId: string | null
}

export interface CreateOrderCommand {
  packageId: string
  versionId: string
  channel: PaymentChannel
  client: 'app' | 'qr'
  idempotencyKey: string
  payableMinor?: string
  channelProductId?: string
  couponCode?: string
}

export function orderFingerprint(command: CreateOrderCommand) {
  return createHash('sha256').update(JSON.stringify({ packageId: command.packageId, versionId: command.versionId, channel: command.channel, client: command.client, payableMinor: command.payableMinor ?? null, channelProductId: command.channelProductId ?? null, couponHash: command.couponCode ? createHash('sha256').update(command.couponCode.toUpperCase()).digest('hex') : null })).digest('hex')
}
