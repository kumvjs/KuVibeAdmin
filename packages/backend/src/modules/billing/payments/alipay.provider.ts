import type { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import type { ProviderRefund } from '../refunds/refund.types.js'
import type { PaymentBinding, ProviderPayment } from './payment.types.js'
import { createHash } from 'node:crypto'
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { AlipaySdk } from 'alipay-sdk'
import { formatInstant, parseInstant } from '#/utils/time.util.js'
import { PaymentConfigService } from './payment-config.service.js'
import { decimalToMinor, minorToDecimal } from './payment.types.js'

@Injectable()
export class AlipayProvider {
  private sdk?: AlipaySdk
  constructor(private readonly config: PaymentConfigService) {}

  binding(): PaymentBinding {
    const settings = this.config.require(this.config.settings.alipay)
    if (!/^\d{10,32}$/.test(settings.appId) || !/^\d{10,32}$/.test(settings.sellerId) || !['sandbox', 'production'].includes(settings.environment))
      throw new Error('支付宝应用、卖家或环境配置无效')
    return { applicationId: settings.appId, merchantId: settings.sellerId, environment: settings.environment }
  }

  async prepare(order: RechargeOrderEntity): Promise<Record<string, string>> {
    const settings = this.config.require(this.config.settings.alipay)
    const params = {
      notifyUrl: this.config.callback(settings.notifyUrl),
      bizContent: { out_trade_no: order.merchantNo, total_amount: minorToDecimal(order.payableMinor!), subject: order.snapshot.title, time_expire: formatInstant(order.expiresAt!, 'Asia/Shanghai', 'YYYY-MM-DD HH:mm:ss'), ...(order.client === 'app' ? { product_code: 'QUICK_MSECURITY_PAY' } : {}) },
    }
    if (order.client === 'app')
      return { orderString: this.client().sdkExecute('alipay.trade.app.pay', params) }
    const result = await this.execute('alipay.trade.precreate', params)
    if (result.code !== '10000' || typeof result.qr_code !== 'string' || !result.qr_code.startsWith('https://'))
      throw new ServiceUnavailableException('支付宝未返回有效支付二维码')
    return { codeUrl: result.qr_code }
  }

  async query(merchantNo: string): Promise<ProviderPayment> {
    const settings = this.config.require(this.config.settings.alipay)
    const result = await this.execute('alipay.trade.query', { bizContent: { out_trade_no: merchantNo } })
    if (result.code !== '10000')
      throw new ServiceUnavailableException('支付宝查单结果未知，保留订单和预占')
    if ((result.app_id && result.app_id !== settings.appId) || (result.seller_id && result.seller_id !== settings.sellerId))
      throw new UnauthorizedException('支付宝查单身份不匹配')
    return this.transaction({ ...result, app_id: settings.appId, seller_id: settings.sellerId }, createHash('sha256').update(JSON.stringify(result)).digest('hex'))
  }

  async close(merchantNo: string) {
    const result = await this.execute('alipay.trade.close', { bizContent: { out_trade_no: merchantNo } })
    if (result.code !== '10000')
      throw new ServiceUnavailableException('支付宝未确认关单，保留预占并重试查单')
  }

  async refund(order: RechargeOrderEntity, refundNo: string, reason: string) {
    const result = await this.execute('alipay.trade.refund', { bizContent: { out_trade_no: order.merchantNo, out_request_no: refundNo, refund_amount: minorToDecimal(order.payableMinor!), refund_reason: Array.from(reason).slice(0, 256).join('') } })
    if (result.code !== '10000')
      throw new ServiceUnavailableException('支付宝退款申请结果未知，保留冻结并以原退款编号查单')
  }

  async refundQuery(refundNo: string, merchantNo: string): Promise<ProviderRefund> {
    const settings = this.config.require(this.config.settings.alipay)
    const data = await this.execute('alipay.trade.fastpay.refund.query', { bizContent: { out_trade_no: merchantNo, out_request_no: refundNo } })
    if (data.code !== '10000')
      throw new ServiceUnavailableException('支付宝退款查单结果未知，保留冻结')
    if (data.out_trade_no !== merchantNo || data.out_request_no !== refundNo || typeof data.trade_no !== 'string' || (data.app_id && data.app_id !== settings.appId) || (data.seller_id && data.seller_id !== settings.sellerId))
      throw new UnauthorizedException('支付宝退款身份或编号不匹配')
    // 接口成功不等于退款成功；仅明确REFUND_SUCCESS才允许扣回冻结权益。
    if (data.refund_status !== 'REFUND_SUCCESS')
      throw new ServiceUnavailableException('支付宝未确认退款成功，继续原编号重试和查单')
    return { channel: 'alipay', merchantId: settings.sellerId, environment: settings.environment, merchantNo, transactionKey: data.trade_no, refundNo, refundKey: refundNo, originalMinor: decimalToMinor(data.total_amount), refundMinor: decimalToMinor(data.refund_amount), currency: 'CNY', state: 'succeeded', evidenceHash: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
  }

  notification(raw: Buffer): ProviderPayment {
    const form = new URLSearchParams(raw.toString('utf8'))
    const data: Record<string, string> = Object.create(null)
    for (const [key, value] of form) {
      if (Object.hasOwn(data, key))
        throw new UnauthorizedException('支付宝通知包含重复参数')
      data[key] = value
    }
    if (data.sign_type !== 'RSA2' || !this.client().checkNotifySignV2(data))
      throw new UnauthorizedException('支付宝通知验签失败')
    return this.transaction(data, createHash('sha256').update(raw).digest('hex'))
  }

  private transaction(data: Record<string, any>, evidenceHash: string): ProviderPayment {
    const settings = this.config.require(this.config.settings.alipay)
    const states: Record<string, ProviderPayment['state']> = { TRADE_SUCCESS: 'paid', TRADE_FINISHED: 'paid', WAIT_BUYER_PAY: 'pending', TRADE_CLOSED: 'closed' }
    if (data.app_id !== settings.appId || data.seller_id !== settings.sellerId || typeof data.out_trade_no !== 'string' || !states[data.trade_status])
      throw new UnauthorizedException('支付宝应用、卖家或状态不匹配')
    const paid = states[data.trade_status] === 'paid'
    if (paid && typeof data.trade_no !== 'string')
      throw new UnauthorizedException('支付宝交易标识无效')
    const paymentTime = data.gmt_payment ?? data.send_pay_date
    const paidAt = typeof paymentTime === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(paymentTime) ? parseInstant(`${paymentTime.replace(' ', 'T')}+08:00`) : null
    return { channel: 'alipay', transactionKey: data.trade_no ?? data.out_trade_no, merchantNo: data.out_trade_no, applicationId: data.app_id, merchantId: data.seller_id, environment: settings.environment, state: states[data.trade_status], amountMinor: paid ? decimalToMinor(data.total_amount) : null, currency: paid ? 'CNY' : null, productId: null, bindingToken: null, quantity: '1', paidAt, evidenceHash }
  }

  private client() {
    if (this.sdk)
      return this.sdk
    const settings = this.config.require(this.config.settings.alipay)
    this.binding()
    const publicKey = this.config.file(settings.publicKeyFile).toString('utf8')
    if (!publicKey.trim())
      throw new Error('支付宝公钥不能为空，禁止跳过验签')
    this.sdk = new AlipaySdk({ appId: settings.appId, privateKey: this.config.file(settings.privateKeyFile).toString('utf8'), alipayPublicKey: publicKey, signType: 'RSA2', keyType: settings.keyType ?? 'PKCS8', camelcase: false, timeout: 8000, gateway: settings.environment === 'sandbox' ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do' : 'https://openapi.alipay.com/gateway.do' })
    return this.sdk
  }

  private async execute(method: string, params: Record<string, any>) {
    try {
      return await this.client().exec(method, params, { validateSign: true })
    }
    catch {
      throw new ServiceUnavailableException('支付宝请求失败或应答验签失败，保持原订单重试')
    }
  }
}
