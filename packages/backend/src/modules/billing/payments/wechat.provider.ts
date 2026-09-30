import type { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import type { PaymentBinding, ProviderPayment } from './payment.types.js'
import { createDecipheriv, createHash, randomBytes, sign, verify } from 'node:crypto'
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { parseInstant } from '#/utils/time.util.js'
import { PaymentConfigService } from './payment-config.service.js'
import { channelRequestAmount, safeChannelInteger } from './payment.types.js'

export function wechatCanonical(method: string, path: string, timestamp: string, nonce: string, body: string) {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`
}

export function verifyWechatMessage(body: string, headers: Record<string, string | string[] | undefined>, keys: Record<string, Buffer>, now = Date.now()) {
  const serial = headers['wechatpay-serial']
  const timestamp = headers['wechatpay-timestamp']
  const nonce = headers['wechatpay-nonce']
  const signature = headers['wechatpay-signature']
  if (typeof serial !== 'string' || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) || typeof nonce !== 'string' || typeof signature !== 'string' || !keys[serial] || Math.abs(Number(timestamp) * 1000 - now) > 300000 || signature.startsWith('WECHATPAY/SIGNTEST/'))
    throw new UnauthorizedException('微信支付签名头、公钥ID或时间窗口无效')
  if (!verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), keys[serial], Buffer.from(signature, 'base64')))
    throw new UnauthorizedException('微信支付验签失败')
}

@Injectable()
export class WechatProvider {
  constructor(private readonly config: PaymentConfigService) {}

  binding(client: string): PaymentBinding {
    const settings = this.config.require(this.config.settings.wechat)
    if (!/^\d{6,32}$/.test(settings.merchantId) || !/^wx[a-z0-9]{10,30}$/i.test(settings.appId) || (settings.nativeAppId && !/^wx[a-z0-9]{10,30}$/i.test(settings.nativeAppId)))
      throw new Error('微信商户或应用配置无效')
    return { applicationId: client === 'qr' ? settings.nativeAppId ?? settings.appId : settings.appId, merchantId: settings.merchantId, environment: 'production' }
  }

  async prepare(order: RechargeOrderEntity, binding: PaymentBinding): Promise<Record<string, string>> {
    const settings = this.config.require(this.config.settings.wechat)
    const result = await this.request('POST', `/v3/pay/transactions/${order.client === 'app' ? 'app' : 'native'}`, {
      appid: binding.applicationId,
      mchid: binding.merchantId,
      out_trade_no: order.merchantNo,
      description: Array.from(order.snapshot.title).slice(0, 40).join(''),
      amount: { total: channelRequestAmount(order.payableMinor!), currency: 'CNY' },
      time_expire: order.expiresAt!.toISOString(),
      notify_url: this.config.callback(settings.notifyUrl),
    })
    if (order.client === 'qr') {
      if (typeof result.code_url !== 'string' || !result.code_url.startsWith('weixin://'))
        throw new ServiceUnavailableException('微信未返回有效支付二维码')
      return { codeUrl: result.code_url }
    }
    if (typeof result.prepay_id !== 'string')
      throw new ServiceUnavailableException('微信未返回预支付标识')
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(16).toString('hex')
    return { appId: binding.applicationId, partnerId: binding.merchantId, prepayId: result.prepay_id, packageValue: 'Sign=WXPay', nonceStr: nonce, timeStamp: timestamp, sign: sign('RSA-SHA256', Buffer.from(`${binding.applicationId}\n${timestamp}\n${nonce}\n${result.prepay_id}\n`), this.config.file(settings.privateKeyFile)).toString('base64') }
  }

  async query(merchantNo: string): Promise<ProviderPayment> {
    const settings = this.config.require(this.config.settings.wechat)
    const result = await this.request('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(merchantNo)}?mchid=${encodeURIComponent(settings.merchantId)}`)
    return this.transaction(result, createHash('sha256').update(JSON.stringify(result)).digest('hex'))
  }

  async close(merchantNo: string) {
    const settings = this.config.require(this.config.settings.wechat)
    await this.request('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(merchantNo)}/close`, { mchid: settings.merchantId })
  }

  notification(body: Buffer, headers: Record<string, string | string[] | undefined>): ProviderPayment {
    const settings = this.config.require(this.config.settings.wechat)
    this.verify(body.toString('utf8'), headers)
    const envelope = JSON.parse(body.toString('utf8'))
    if (envelope.resource?.algorithm !== 'AEAD_AES_256_GCM' || envelope.event_type !== 'TRANSACTION.SUCCESS')
      throw new UnauthorizedException('暂不接受该微信通知类型')
    const key = this.config.file(settings.apiV3KeyFile).toString('utf8').trim()
    if (Buffer.byteLength(key) !== 32)
      throw new Error('微信APIv3密钥长度无效')
    const resource = envelope.resource
    const encrypted = Buffer.from(resource.ciphertext, 'base64')
    if (encrypted.length < 17 || typeof resource.nonce !== 'string' || resource.nonce.length !== 12)
      throw new UnauthorizedException('微信通知密文格式无效')
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(resource.nonce))
    decipher.setAuthTag(encrypted.subarray(-16))
    decipher.setAAD(Buffer.from(resource.associated_data ?? ''))
    let data: Record<string, any>
    try {
      data = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8'))
    }
    catch {
      throw new UnauthorizedException('微信通知解密失败')
    }
    return this.transaction(data, createHash('sha256').update(body).digest('hex'))
  }

  private transaction(data: Record<string, any>, evidenceHash: string): ProviderPayment {
    const settings = this.config.require(this.config.settings.wechat)
    const states: Record<string, ProviderPayment['state']> = { SUCCESS: 'paid', NOTPAY: 'pending', USERPAYING: 'pending', PAYERROR: 'pending', CLOSED: 'closed', REVOKED: 'closed', REFUND: 'refunded' }
    if (data.mchid !== settings.merchantId || ![settings.appId, settings.nativeAppId].includes(data.appid) || typeof data.out_trade_no !== 'string' || !states[data.trade_state])
      throw new UnauthorizedException('微信商户、应用或交易状态不匹配')
    const paid = data.trade_state === 'SUCCESS'
    if (paid && (typeof data.transaction_id !== 'string' || data.amount?.currency !== 'CNY'))
      throw new UnauthorizedException('微信交易标识或币种无效')
    return { channel: 'wechat', transactionKey: data.transaction_id ?? data.out_trade_no, merchantNo: data.out_trade_no, applicationId: data.appid, merchantId: data.mchid, environment: 'production', state: states[data.trade_state], amountMinor: paid ? safeChannelInteger(data.amount.total, '总金额') : null, currency: paid ? 'CNY' : null, productId: null, bindingToken: null, quantity: '1', paidAt: paid ? parseInstant(data.success_time) : null, evidenceHash }
  }

  private verify(body: string, headers: Record<string, string | string[] | undefined>) {
    const settings = this.config.require(this.config.settings.wechat)
    const keys = Object.fromEntries(Object.entries(settings.platformKeys).map(([serial, path]) => [serial, this.config.file(path)]))
    verifyWechatMessage(body, headers, keys)
  }

  private async request(method: string, path: string, data?: Record<string, unknown>): Promise<Record<string, any>> {
    const settings = this.config.require(this.config.settings.wechat)
    if (!/^\w{1,128}$/.test(settings.certificateSerial))
      throw new Error('微信API证书序列号无效')
    const body = data ? JSON.stringify(data) : ''
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(16).toString('hex')
    const signature = sign('RSA-SHA256', Buffer.from(wechatCanonical(method, path, timestamp, nonce, body)), this.config.file(settings.privateKeyFile)).toString('base64')
    let response: Response
    try {
      response = await fetch(`https://api.mch.weixin.qq.com${path}`, { method, headers: { 'Authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${settings.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${settings.certificateSerial}",signature="${signature}"`, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: data ? body : undefined, signal: AbortSignal.timeout(8000), redirect: 'error' })
    }
    catch {
      throw new ServiceUnavailableException('微信请求超时或网络失败，保持原订单重试')
    }
    const text = await response.text()
    if (!response.ok)
      throw new ServiceUnavailableException(`微信渠道返回HTTP ${response.status}，状态未知，请查单确认`)
    this.verify(text, Object.fromEntries(response.headers))
    return text ? JSON.parse(text) : {}
  }
}
