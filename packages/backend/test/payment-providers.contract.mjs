/* eslint-disable antfu/no-import-dist -- 验签使用本地临时RSA密钥，网络应答为契约替身，不代表商户联调。 */
import assert from 'node:assert/strict'
import { createCipheriv, createHash, generateKeyPairSync, sign, verify } from 'node:crypto'
import { test } from 'node:test'
import { AlipayProvider } from '../dist/src/modules/billing/payments/alipay.provider.js'
import { GoogleProvider } from '../dist/src/modules/billing/payments/google.provider.js'
import { wechatCanonical, WechatProvider } from '../dist/src/modules/billing/payments/wechat.provider.js'

const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 })
const channel = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privatePem = merchant.privateKey.export({ type: 'pkcs8', format: 'pem' })
const channelPem = channel.publicKey.export({ type: 'spki', format: 'pem' })
const settings = {
  wechat: { enabled: true, appId: 'wx1234567890abc', nativeAppId: 'wx1234567890def', merchantId: '1234567890', certificateSerial: 'cert123', privateKeyFile: 'private', apiV3KeyFile: 'v3', platformKeys: { 'trusted-key': 'public' }, notifyUrl: 'https://callback.example/api/payments/wechat/notify' },
  alipay: { enabled: true, appId: '202609300000001', sellerId: '2088123456789000', environment: 'sandbox', privateKeyFile: 'private', publicKeyFile: 'public', keyType: 'PKCS8', notifyUrl: 'https://callback.example/api/payments/alipay/notify' },
}
const config = { settings, require: value => value, callback: url => url, file: name => Buffer.from({ private: privatePem, public: channelPem, v3: '12345678901234567890123456789012' }[name]) }
const order = { merchantNo: 'merchantfixture', payableMinor: '1000', snapshot: { title: '测试充值' }, expiresAt: new Date(Date.now() + 900000), client: 'qr' }
function wechatHeaders(body) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = 'fixture-nonce'
  return { 'wechatpay-serial': 'trusted-key', 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-signature': sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), channel.privateKey).toString('base64') }
}

test('微信Native/App请求签名、应答验签、App二次签名及AEAD通知解密', async () => {
  const provider = new WechatProvider(config)
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const auth = options.headers.Authorization
    const timestamp = /timestamp="([^"]+)"/.exec(auth)[1]
    const nonce = /nonce_str="([^"]+)"/.exec(auth)[1]
    const signature = /signature="([^"]+)"/.exec(auth)[1]
    const target = new URL(url)
    assert.ok(verify('RSA-SHA256', Buffer.from(wechatCanonical(options.method, target.pathname + target.search, timestamp, nonce, options.body ?? '')), merchant.publicKey, Buffer.from(signature, 'base64')))
    const body = JSON.parse(options.body)
    assert.equal(body.amount.total, 1000)
    assert.equal(body.mchid, settings.wechat.merchantId)
    assert.equal(body.time_expire, order.expiresAt.toISOString())
    const text = target.pathname.endsWith('/app') ? '{"prepay_id":"prepayfixture"}' : '{"code_url":"weixin://fixture"}'
    return new Response(text, { headers: wechatHeaders(text) })
  }
  try {
    assert.deepEqual(await provider.prepare(order, provider.binding('qr')), { codeUrl: 'weixin://fixture' })
    const app = await provider.prepare({ ...order, client: 'app' }, provider.binding('app'))
    assert.ok(verify('RSA-SHA256', Buffer.from(`${app.appId}\n${app.timeStamp}\n${app.nonceStr}\n${app.prepayId}\n`), merchant.publicKey, Buffer.from(app.sign, 'base64')))
  }
  finally { globalThis.fetch = original }
  const transaction = { appid: settings.wechat.nativeAppId, mchid: settings.wechat.merchantId, out_trade_no: order.merchantNo, transaction_id: 'wechatfixture', trade_state: 'SUCCESS', amount: { total: 1000, currency: 'CNY' }, success_time: '2026-09-30T10:00:00+08:00' }
  const cipher = createCipheriv('aes-256-gcm', config.file('v3'), Buffer.from('123456789012'))
  cipher.setAAD(Buffer.from('transaction'))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(transaction)), cipher.final(), cipher.getAuthTag()]).toString('base64')
  const raw = Buffer.from(JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', nonce: '123456789012', associated_data: 'transaction', ciphertext } }))
  assert.equal(provider.notification(raw, wechatHeaders(raw)).amountMinor, '1000')
  assert.throws(() => provider.notification(Buffer.from(`${raw} `), wechatHeaders(raw)), /验签/)
})

test('支付宝官方SDK验已解码通知、拒绝篡改和重复参数，App订单字符串可验商户签名', async () => {
  const provider = new AlipayProvider(config)
  const data = { app_id: settings.alipay.appId, seller_id: settings.alipay.sellerId, out_trade_no: order.merchantNo, trade_no: '20260930fixture', trade_status: 'TRADE_SUCCESS', total_amount: '10.00', subject: '套餐 + 优惠', gmt_payment: '2026-09-30 10:00:00' }
  const canonical = Object.keys(data).sort().map(key => `${key}=${data[key]}`).join('&')
  const signature = sign('RSA-SHA256', Buffer.from(canonical), channel.privateKey).toString('base64')
  const raw = new URLSearchParams({ ...data, sign_type: 'RSA2', sign: signature }).toString()
  assert.equal(provider.notification(Buffer.from(raw)).amountMinor, '1000')
  assert.throws(() => provider.notification(Buffer.from(raw.replace('10.00', '99.00'))), /验签/)
  assert.throws(() => provider.notification(Buffer.from(`${raw}&total_amount=10.00`)), /重复参数/)
  const params = await provider.prepare({ ...order, client: 'app' })
  const form = new URLSearchParams(params.orderString)
  assert.equal(form.get('method'), 'alipay.trade.app.pay')
  const signed = [...form].filter(([key]) => key !== 'sign').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&')
  assert.ok(verify('RSA-SHA256', Buffer.from(signed), merchant.publicKey, Buffer.from(form.get('sign'), 'base64')))
})

test('Google productsv2按token去重、待付款不假造完成时间、检测测试环境与部分退款', async () => {
  const provider = new GoogleProvider({ ...config, settings: { google: [{ enabled: true, packageName: 'test.app', environment: 'sandbox' }] } })
  const data = { purchaseStateContext: { purchaseState: 'PURCHASED' }, testPurchaseContext: { fopType: 'TEST' }, productLineItem: [{ productId: 'sku', productOfferDetails: { quantity: 1, refundableQuantity: 1, consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }], obfuscatedExternalAccountId: 'account', obfuscatedExternalProfileId: 'profile', purchaseCompletionTime: '2026-09-30T02:00:00Z' }
  provider.request = async () => data
  const purchase = await provider.query('test.app', 'sandbox', 'purchasefixture')
  assert.equal(purchase.payment.transactionKey, createHashForToken('purchasefixture'))
  assert.equal(purchase.payment.state, 'paid')
  assert.equal(purchase.payment.amountMinor, null)
  assert.equal(purchase.payment.currency, null)
  data.productLineItem[0].productOfferDetails.quantity = 2
  assert.equal((await provider.query('test.app', 'sandbox', 'purchasefixture')).payment.refundScope, 'partial')
  data.testPurchaseContext = undefined
  await assert.rejects(provider.query('test.app', 'sandbox', 'purchasefixture'), /环境/)
  provider.request = async () => ({ purchaseStateContext: { purchaseState: 'PENDING' } })
  const pending = await provider.query('test.app', 'sandbox', 'purchasefixture')
  assert.equal(pending.payment.state, 'pending')
  assert.equal(pending.payment.paidAt, null)
  await assert.rejects(provider.notification({ message: { data: 'e30=' } }), /OIDC/)
})

function createHashForToken(token) {
  return createHash('sha256').update(token).digest('hex')
}
