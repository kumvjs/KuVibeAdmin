import type { GoogleSettings } from './payment-config.service.js'
import type { PaymentBinding, ProviderPayment } from './payment.types.js'
import { createHash } from 'node:crypto'
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { GoogleAuth, OAuth2Client } from 'google-auth-library'
import { parseInstant } from '#/utils/time.util.js'
import { PaymentConfigService } from './payment-config.service.js'
import { channelDeadline, safeChannelInteger } from './payment.types.js'

export interface GooglePurchase { payment: ProviderPayment, consumed: boolean }

@Injectable()
export class GoogleProvider {
  constructor(private readonly config: PaymentConfigService) {}

  binding(applicationId: string, environment: string): PaymentBinding {
    this.settings(applicationId, environment)
    return { applicationId, merchantId: applicationId, environment: environment as PaymentBinding['environment'] }
  }

  async query(applicationId: string, environment: string, token: string): Promise<GooglePurchase> {
    this.token(token)
    const settings = this.settings(applicationId, environment)
    const data = await this.request(settings, 'GET', `/applications/${encodeURIComponent(applicationId)}/purchases/productsv2/tokens/${encodeURIComponent(token)}`)
    const state = data.purchaseStateContext?.purchaseState
    const states: Record<string, ProviderPayment['state']> = { PURCHASED: 'paid', PENDING: 'pending', CANCELLED: 'closed' }
    const line = data.productLineItem?.[0]
    if (state === 'PENDING') {
      // 待付款应答可能尚未包含购买完成信息；仅继续等待，不确认商品权益或消费。
      return { payment: { channel: 'google', transactionKey: createHash('sha256').update(token).digest('hex'), merchantNo: null, applicationId, merchantId: applicationId, environment: environment as PaymentBinding['environment'], state: 'pending', amountMinor: null, currency: null, productId: line?.productId ?? null, bindingToken: data.obfuscatedExternalProfileId ?? null, storeAccountId: data.obfuscatedExternalAccountId ?? null, quantity: '1', paidAt: null, evidenceHash: createHash('sha256').update(JSON.stringify(data)).digest('hex') }, consumed: false }
    }
    if (!states[state] || !Array.isArray(data.productLineItem) || data.productLineItem.length !== 1 || !line?.productId || !line.productOfferDetails || (data.testPurchaseContext ? 'sandbox' : 'production') !== environment)
      throw new UnauthorizedException('Google购买状态、商品或环境无效')
    const quantity = safeChannelInteger(line.productOfferDetails.quantity ?? (state === 'PURCHASED' ? undefined : 1), '商品数量')
    if (line.productOfferDetails.rentOfferDetails || line.productOfferDetails.preorderDetails)
      throw new UnauthorizedException('积分充值不支持租赁或预订商品')
    const refundable = safeChannelInteger(line.productOfferDetails.refundableQuantity ?? (state === 'PURCHASED' ? undefined : 1), '可退款数量')
    const fullRefund = state === 'PURCHASED' && refundable === '0'
    const partial = state === 'PURCHASED' && BigInt(refundable) < BigInt(quantity) && !fullRefund
    const payment: ProviderPayment = { channel: 'google', transactionKey: createHash('sha256').update(token).digest('hex'), merchantNo: null, applicationId, merchantId: applicationId, environment: environment as PaymentBinding['environment'], state: fullRefund || partial ? 'refunded' : states[state], amountMinor: null, currency: null, productId: line.productId, bindingToken: data.obfuscatedExternalProfileId ?? null, storeAccountId: data.obfuscatedExternalAccountId ?? null, quantity, paidAt: state === 'PURCHASED' ? parseInstant(data.purchaseCompletionTime) : null, evidenceHash: createHash('sha256').update(JSON.stringify(data)).digest('hex'), ...(fullRefund || partial ? { refundScope: partial ? 'partial' : 'full' } : {}) }
    return { payment, consumed: line.productOfferDetails.consumptionState === 'CONSUMPTION_STATE_CONSUMED' }
  }

  async consume(applicationId: string, environment: string, productId: string, token: string) {
    const purchase = await this.query(applicationId, environment, token)
    if (purchase.payment.productId !== productId)
      throw new UnauthorizedException('Google消费商品不匹配')
    if (purchase.consumed || purchase.payment.state === 'refunded' || purchase.payment.state === 'closed')
      return
    if (purchase.payment.state !== 'paid')
      throw new ServiceUnavailableException('Google待付款不能消费确认')
    await this.request(this.settings(applicationId, environment), 'POST', `/applications/${encodeURIComponent(applicationId)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`)
  }

  async notification(body: unknown, authorization: string | undefined) {
    const envelope = body as { message?: { data?: string, messageId?: string } }
    if (!authorization?.startsWith('Bearer ') || typeof envelope?.message?.data !== 'string' || envelope.message.data.length > 131072)
      throw new UnauthorizedException('Google推送缺少OIDC授权或消息数据')
    const settings = (this.config.settings.google ?? []).filter(item => item.enabled === true)
    if (!settings.length)
      throw new ServiceUnavailableException('Google渠道尚未启用')
    for (const item of settings) {
      let identity
      try {
        identity = (await channelDeadline(new OAuth2Client().verifyIdToken({ idToken: authorization.slice(7), audience: item.pushAudience }))).getPayload()
      }
      catch {
        continue
      }
      if (identity?.email_verified !== true || identity.email !== item.pushServiceAccountEmail || !['accounts.google.com', 'https://accounts.google.com'].includes(identity.iss))
        continue
      const data = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'))
      if (data.packageName !== item.packageName)
        continue
      const voided = data.voidedPurchaseNotification
      const token = data.oneTimeProductNotification?.purchaseToken ?? voided?.purchaseToken
      if (token)
        this.token(token)
      return { token: token ?? null, noticeData: JSON.stringify(data), applicationId: item.packageName, hash: createHash('sha256').update(envelope.message.data).digest('hex'), type: voided ? 'voided' : data.oneTimeProductNotification ? 'one_time' : data.testNotification ? 'test' : 'unsupported', ...(voided ? { refundScope: voided.refundType === 1 && voided.productType === 2 ? 'full' as const : 'partial' as const } : {}) }
    }
    throw new UnauthorizedException('Google推送身份、受众或应用不匹配')
  }

  private settings(applicationId: string, environment: string) {
    if (!['sandbox', 'production'].includes(environment))
      throw new UnauthorizedException('Google验真环境无效')
    return this.config.require(this.config.settings.google?.find(item => item.packageName === applicationId && item.environment === environment))
  }

  private token(token: string) {
    if (typeof token !== 'string' || !/^[\w.:-]{1,4096}$/.test(token))
      throw new UnauthorizedException('Google购买token格式无效')
  }

  private async request(settings: GoogleSettings, method: 'GET' | 'POST', path: string): Promise<Record<string, any>> {
    const credentials = JSON.parse(this.config.file(settings.credentialsFile).toString('utf8'))
    if (credentials.type !== 'service_account')
      throw new Error('Google仅接受配置的服务账户身份')
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
    try {
      const client = await channelDeadline(auth.getClient())
      const result = await channelDeadline(client.request({ method, url: `https://androidpublisher.googleapis.com/androidpublisher/v3${path}`, timeout: 8000, retry: false }))
      return result.data as Record<string, any>
    }
    catch {
      throw new ServiceUnavailableException('Google请求失败或状态未知，保留验真/消费任务')
    }
  }
}
