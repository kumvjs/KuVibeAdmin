import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import type { PaymentBinding, ProviderPayment } from './payment.types.js'
import { createHash } from 'node:crypto'
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Type } from '@apple/app-store-server-library'
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { PaymentConfigService } from './payment-config.service.js'
import { channelDeadline, safeChannelInteger } from './payment.types.js'

@Injectable()
export class AppleProvider {
  constructor(private readonly config: PaymentConfigService) {}

  binding(applicationId: string, environment: string): PaymentBinding {
    this.settings(applicationId, environment)
    return { applicationId, merchantId: applicationId, environment: environment as PaymentBinding['environment'] }
  }

  async query(applicationId: string, environment: string, transactionId: string): Promise<ProviderPayment> {
    if (!/^\d{1,64}$/.test(transactionId))
      throw new UnauthorizedException('Apple交易标识无效')
    const settings = this.settings(applicationId, environment)
    const client = new AppStoreServerAPIClient(this.config.file(settings.privateKeyFile).toString('utf8'), settings.keyId, settings.issuerId, settings.bundleId, this.environment(settings.environment))
    let signed: string | undefined
    try {
      signed = (await channelDeadline(client.getTransactionInfo(transactionId))).signedTransactionInfo
    }
    catch {
      throw new ServiceUnavailableException('Apple查单结果未知，保留验真任务')
    }
    if (!signed)
      throw new UnauthorizedException('Apple应答缺少签名交易')
    const decoded = await channelDeadline(this.verifier(settings).verifyAndDecodeTransaction(signed))
    if (decoded.transactionId !== transactionId)
      throw new UnauthorizedException('Apple交易标识与查询不符')
    return this.transaction(decoded, createHash('sha256').update(signed).digest('hex'))
  }

  async notification(signed: string) {
    if (typeof signed !== 'string' || signed.length > 131072)
      throw new UnauthorizedException('Apple通知签名长度无效')
    const settings = (this.config.settings.apple ?? []).filter(item => item.enabled === true)
    if (!settings.length)
      throw new ServiceUnavailableException('Apple渠道尚未启用')
    for (const item of settings) {
      let decoded
      try {
        decoded = await channelDeadline(this.verifier(item).verifyAndDecodeNotification(signed))
      }
      catch {
        continue
      }
      const hash = createHash('sha256').update(signed).digest('hex')
      if (!decoded.data?.signedTransactionInfo)
        return { payment: null, type: decoded.notificationType ?? 'unknown', hash, applicationId: item.bundleId, environment: item.environment }
      const transaction = await channelDeadline(this.verifier(item).verifyAndDecodeTransaction(decoded.data.signedTransactionInfo))
      return { payment: this.transaction(transaction, hash), type: decoded.notificationType ?? 'unknown', hash, applicationId: item.bundleId, environment: item.environment }
    }
    throw new UnauthorizedException('Apple通知证书链、应用或环境验真失败')
  }

  private transaction(data: JWSTransactionDecodedPayload, evidenceHash: string): ProviderPayment {
    const environment = data.environment === Environment.SANDBOX ? 'sandbox' : data.environment === Environment.PRODUCTION ? 'production' : null
    if (!environment || !data.bundleId || !/^\d{1,64}$/.test(data.transactionId ?? '') || !data.productId || data.type !== Type.CONSUMABLE || data.inAppOwnershipType !== 'PURCHASED')
      throw new UnauthorizedException('Apple应用、消耗型商品或购买归属无效')
    const quantity = safeChannelInteger(data.quantity, '商品数量')
    const purchaseMillis = Number(data.purchaseDate)
    if (!Number.isSafeInteger(purchaseMillis) || purchaseMillis <= 0 || Number.isNaN(new Date(purchaseMillis).getTime()))
      throw new UnauthorizedException('Apple购买时间无效')
    const revoked = data.revocationDate !== undefined
    const partial = revoked && data.revocationPercentage !== undefined && data.revocationPercentage !== 100000
    const platformAmount = data.price !== undefined && typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency)
      ? { value: safeChannelInteger(data.price, '千分之一货币单位金额'), scale: 3, currency: data.currency, source: 'apple_transaction' as const }
      : undefined
    return { channel: 'apple', transactionKey: `${environment}:${data.bundleId}:${data.transactionId}`, merchantNo: null, applicationId: data.bundleId, merchantId: data.bundleId, environment, state: revoked ? 'refunded' : 'paid', amountMinor: null, currency: data.currency ?? null, productId: data.productId, bindingToken: data.appAccountToken?.toLowerCase() ?? null, quantity, paidAt: new Date(purchaseMillis), evidenceHash, ...(platformAmount ? { platformAmount } : {}), ...(revoked ? { refundScope: partial ? 'partial' : 'full' } : {}) }
  }

  private settings(applicationId: string, environment: string) {
    return this.config.require(this.config.settings.apple?.find(item => item.bundleId === applicationId && item.environment === environment))
  }

  private environment(value: string) {
    if (!['sandbox', 'production'].includes(value))
      throw new Error('Apple环境仅支持sandbox/production，禁止本地免验签环境')
    return value === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION
  }

  private verifier(settings: NonNullable<PaymentConfigService['settings']['apple']>[number]) {
    if (!settings.rootCertificateFiles?.length || (settings.environment === 'production' && (!Number.isSafeInteger(settings.appAppleId) || settings.appAppleId! <= 0)))
      throw new Error('Apple验真需要可信根证书；生产环境还须appAppleId')
    return new SignedDataVerifier(settings.rootCertificateFiles.map(path => this.config.file(path)), true, this.environment(settings.environment), settings.bundleId, settings.appAppleId)
  }
}
