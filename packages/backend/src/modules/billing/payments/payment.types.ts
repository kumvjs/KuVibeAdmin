import type { PaymentChannel } from '../catalog/catalog.types.js'
import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { PG_BIGINT_MAX } from '../points/points.types.js'

export interface PaymentBinding { applicationId: string, merchantId: string, environment: 'sandbox' | 'production', storeToken?: string, storeAccountId?: string, googleOrderMode?: 'account' }

export const PAYMENT_PERMISSIONS = { READ: 'system:billing:payment:read', RECHECK: 'system:billing:payment:recheck', BIND: 'system:billing:payment:bind' } as const
export interface ProviderPayment {
  channel: PaymentChannel
  transactionKey: string
  merchantNo: string | null
  applicationId: string
  merchantId: string
  environment: 'sandbox' | 'production'
  state: 'paid' | 'pending' | 'closed' | 'refunded'
  amountMinor: string | null
  currency: string | null
  productId: string | null
  bindingToken: string | null
  storeAccountId?: string | null
  refundScope?: 'full' | 'partial'
  quantity: string
  paidAt: Date | null
  evidenceHash: string
  /** 商店原始精度的已验真金额，不混入现金订单CNY分。 */
  platformAmount?: { value: string, scale: number, currency: string, source: 'apple_transaction' | 'google_order' }
  platformOrderId?: string
}

export function googleOrderAmount(money: { currencyCode?: unknown, units?: unknown, nanos?: unknown }) {
  const units = money.units ?? '0'
  const nanos = money.nanos ?? 0
  if (typeof money.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(money.currencyCode) || typeof units !== 'string' || !/^(?:0|[1-9]\d{0,18})$/.test(units) || BigInt(units) > PG_BIGINT_MAX || typeof nanos !== 'number' || !Number.isInteger(nanos) || nanos < 0 || nanos > 999999999)
    throw new UnauthorizedException('Google订单金额格式无效')
  return { value: (BigInt(units) * 1000000000n + BigInt(nanos)).toString(), scale: 9, currency: money.currencyCode, source: 'google_order' as const }
}

export class ChannelPendingError extends Error {}

/** SDK只读调用的上界；超时不得视为未支付、未退款或关单成功。 */
export async function channelDeadline<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([request, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('channel_timeout')), 8000)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}

export function decimalToMinor(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/.test(value))
    throw new UnauthorizedException('渠道金额格式无效')
  const [whole, fraction = ''] = value.split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (amount > PG_BIGINT_MAX)
    throw new UnauthorizedException('渠道金额超出范围')
  return amount.toString()
}

export function minorToDecimal(value: string) {
  const amount = BigInt(value)
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`
}

export function safeChannelInteger(value: unknown, field: string): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new UnauthorizedException(`渠道${field}必须为安全非负整数`)
  return value.toString()
}

export function channelRequestAmount(value: string) {
  if (BigInt(value) > 2147483647n)
    throw new UnprocessableEntityException('支付金额超过渠道整数参数范围')
  return Number(value)
}
