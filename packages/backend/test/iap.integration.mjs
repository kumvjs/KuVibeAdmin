/* eslint-disable antfu/no-import-dist -- 真实PG内购领域测试；商店网络是明确的契约替身。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { PaymentSecretsService } from '../dist/src/modules/billing/payments/payment-secrets.service.js'
import { PaymentsService } from '../dist/src/modules/billing/payments/payments.service.js'
import { SettlementService } from '../dist/src/modules/billing/payments/settlement.service.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { RefundsService } from '../dist/src/modules/billing/refunds/refunds.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
let source, catalog, orders, outbox, points, payments, actor
const proofs = new Map()
let consumeCount = 0
let failConsume = false
const code = () => `iap_${randomUUID().replaceAll('-', '')}`
const makeBinding = (applicationId, environment) => ({ applicationId, merchantId: applicationId, environment })
const apple = { binding: makeBinding, query: async (_app, _env, id) => proofs.get(id), notification: async id => ({ payment: proofs.get(id), type: 'ONE_TIME_CHARGE', hash: createHash('sha256').update(id).digest('hex'), applicationId: 'test.iap', environment: 'sandbox' }) }
const google = {
  binding: makeBinding,
  query: async (_app, environment, token) => {
    const payment = proofs.get(token)
    if (payment.environment !== environment)
      throw new Error('environment_mismatch')
    return { payment, consumed: false }
  },
  consume: async (_app, _env, _product, token) => {
    const payment = proofs.get(token)
    const [row] = await source.query('SELECT o.paid_ledger_id FROM biz_recharge_order o JOIN biz_payment_transaction t ON t.order_id=o.id WHERE t.channel=\'google\' AND t.transaction_key=$1', [payment.transactionKey])
    assert.ok(row?.paid_ledger_id, '消费确认前必须已持久化入账')
    consumeCount++
    if (failConsume)
      throw new Error('consume_network_failure')
  },
  notification: async token => ({ token, applicationId: 'test.iap', type: 'one_time', hash: createHash('sha256').update(`notice:${token}`).digest('hex') }),
}
async function user() {
  return source.getRepository(SysUserEntity).save({ username: code(), name: '内购测试用户', passwordHash: '$argon2id$fixture' })
}
async function pack() {
  const row = await catalog.createPackage({ code: code(), title: '固定内购权益', priceMinor: '1000', basePoints: '1000', giftPoints: '100', totalLimit: null, dailyLimit: null }, actor.id)
  await catalog.publishPackage(row.id, 'enabled')
  return row
}
async function order(buyer, pkg, channel) {
  const product = await catalog.mapProduct({ versionId: pkg.versionId, channel, applicationId: 'test.iap', environment: 'sandbox', productId: code() }, actor.id)
  const row = await orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel, channelProductId: product.id, client: 'app', idempotencyKey: randomUUID() })
  const prepared = await payments.prepare(buyer.id, row.id)
  assert.equal(prepared.status, 'ready')
  return { row, parameters: prepared.parameters }
}
function purchase(row, parameters, fields = {}) {
  const credential = row.channel === 'apple' ? String(BigInt(`0x${randomUUID().replaceAll('-', '')}`)) : code()
  const payment = { channel: row.channel, transactionKey: row.channel === 'google' ? createHash('sha256').update(credential).digest('hex') : `sandbox:test.iap:${credential}`, merchantNo: null, ...makeBinding('test.iap', 'sandbox'), state: 'paid', amountMinor: null, currency: null, productId: parameters.productId, bindingToken: parameters.appAccountToken ?? parameters.obfuscatedProfileId ?? null, storeAccountId: parameters.obfuscatedAccountId ?? null, quantity: '1', paidAt: new Date(), evidenceHash: createHash('sha256').update(credential).digest('hex'), ...fields }
  proofs.set(credential, payment)
  return credential
}
const receipt = (buyer, row, credential) => payments.receipt(buyer.id, row.id, row.channel === 'apple' ? { transactionId: credential } : { purchaseToken: credential })
before(async () => {
  source = await new DataSource({ type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }).initialize()
  await source.runMigrations()
  const quotas = new QuotaService()
  catalog = new CatalogService(source, quotas)
  orders = new OrdersService(source, catalog, quotas, outbox = new BillingOutboxService(source))
  points = new PointsService(source)
  const refunds = new RefundsService(source, orders, points, outbox, {}, {})
  const settlement = new SettlementService(source, catalog, orders, quotas, points, outbox, refunds)
  const secrets = new PaymentSecretsService({ dataKey: () => ({ key: Buffer.alloc(32, 53), id: 'fixture' }) })
  payments = new PaymentsService(source, catalog, orders, outbox, settlement, {}, {}, apple, google, secrets)
  actor = await user()
})

test('Apple/Google验真全额退款追回原权益，Google缺失绑定仅从已持久化同交易恢复；退款早于入账不占首单', async () => {
  for (const channel of ['apple', 'google']) {
    const buyer = await user()
    const { row, parameters } = await order(buyer, await pack(), channel)
    const credential = purchase(row, parameters)
    const accepted = await receipt(buyer, row, credential)
    await payments.processInbox(accepted.inboxId)
    proofs.set(credential, { ...proofs.get(credential), state: 'refunded', refundScope: 'full', evidenceHash: createHash('sha256').update(`refund:${credential}`).digest('hex'), ...(channel === 'google' ? { bindingToken: null, storeAccountId: null } : {}) })
    const refunded = channel === 'google' ? await payments.acceptGoogle(credential) : await payments.acceptApple(credential)
    await payments.processInbox(refunded.inboxId)
    assert.equal((await orders.get(buyer.id, row.id)).status, 'refunded')
    assert.equal((await points.account(buyer.id)).available, '0')
    assert.equal((await source.query('SELECT first_order_id::text FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id]))[0].first_order_id, row.id)
  }
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'apple')
  const credential = purchase(row, parameters, { state: 'refunded', refundScope: 'full' })
  const inbox = await receipt(buyer, row, credential)
  await payments.processInbox(inbox.inboxId)
  assert.equal((await orders.get(buyer.id, row.id)).status, 'refunded')
  assert.equal((await points.account(buyer.id)).available, '0')
  assert.equal((await source.query('SELECT first_order_id FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id]))[0].first_order_id, null)
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('Apple/Google并发验真跨渠道只中一次首单；四渠道套餐额度预占核销', async () => {
  const buyer = await user()
  const pkg = await pack()
  const promo = await catalog.createPromotion({ code: code(), title: '跨渠道首单', startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), effect: 'bonus_fixed', value: '500', eligibility: 'first_user', channels: ['apple', 'google'], packageIds: [pkg.id], minimumMinor: '0', requiresCoupon: false, priority: 1 }, actor.id)
  await catalog.publishPromotion(promo.id, 'enabled')
  const purchases = await Promise.all(['apple', 'google'].map(channel => order(buyer, pkg, channel)))
  const credentials = purchases.map(({ row, parameters }) => purchase(row, parameters))
  const inboxes = await Promise.all(purchases.map(({ row }, index) => receipt(buyer, row, credentials[index])))
  const googleRecord = (await source.query('SELECT payload FROM biz_payment_inbox WHERE id=$1', [inboxes[1].inboxId]))[0].payload
  assert.ok(!JSON.stringify(googleRecord).includes(credentials[1]))
  await Promise.all(inboxes.map(row => payments.processInbox(row.inboxId)))
  assert.equal((await points.account(buyer.id)).available, '2700')
  const transactions = await source.query('SELECT bonus_points::text FROM biz_payment_transaction WHERE order_id=ANY($1)', [purchases.map(item => item.row.id)])
  assert.deepEqual(transactions.map(row => row.bonus_points).sort(), ['0', '500'])
  assert.equal((await source.query('SELECT settlement_sequence::text FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id]))[0].settlement_sequence, '2')
  assert.equal((await source.query('SELECT id FROM biz_order_reservation WHERE order_id=ANY($1) AND purpose=\'package\'', [purchases.map(item => item.row.id)])).length, 8)
  await Promise.all(inboxes.map(row => payments.processInbox(row.inboxId)))
  assert.equal((await points.account(buyer.id)).available, '2700')
})

test('Google pending不入账/不消费/不占首单；正常等待不耗尽十次重试', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'google')
  const token = purchase(row, parameters, { state: 'pending', paidAt: null })
  const accepted = await receipt(buyer, row, token)
  for (let index = 0; index < 12; index++) await assert.rejects(payments.processInbox(accepted.inboxId), /待付款/)
  assert.equal((await points.account(buyer.id)).available, '0')
  assert.equal((await source.query('SELECT first_order_id FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id]))[0].first_order_id, null)
  await assert.rejects(payments.consume(accepted.inboxId), /先持久化/)
  const type = code()
  await source.transaction(manager => outbox.enqueue(manager, type, accepted.inboxId, code()))
  const lease = (await outbox.claim([type], 1))[0]
  await outbox.defer(lease, 5)
  const job = (await source.query('SELECT attempts,status FROM biz_billing_outbox WHERE id=$1', [lease.id]))[0]
  assert.deepEqual(job, { attempts: 0, status: 'pending' })
  assert.equal(await outbox.complete(lease), false)
  proofs.get(token).state = 'paid'
  proofs.get(token).paidAt = new Date()
  await payments.processInbox(accepted.inboxId)
  assert.equal((await points.account(buyer.id)).available, '1100')
})

test('消费确认失败不回滚已到账权益；原任务可重试，不能先消费再到账', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'google')
  const token = purchase(row, parameters)
  const accepted = await receipt(buyer, row, token)
  await payments.processInbox(accepted.inboxId)
  const [job] = await source.query('SELECT status FROM biz_billing_outbox WHERE type=\'google_consume\' AND aggregate_id=$1', [accepted.inboxId])
  assert.equal(job.status, 'pending')
  failConsume = true
  try {
    await assert.rejects(payments.consume(accepted.inboxId), /consume_network_failure/)
  }
  finally { failConsume = false }
  assert.equal((await points.account(buyer.id)).available, '1100')
  const before = consumeCount
  await payments.consume(accepted.inboxId)
  assert.equal(consumeCount, before + 1)
})

test('重复凭据/重复通知只一份权益；RTDN先落流水，客户端以原订单补报关联，不靠Google orderId', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'google')
  const token = purchase(row, parameters)
  const notifications = await Promise.all(Array.from({ length: 30 }, () => payments.acceptGoogle(token, 'fixture')))
  assert.equal(new Set(notifications.map(item => item.inboxId)).size, 1)
  await Promise.all(Array.from({ length: 30 }, () => payments.processInbox(notifications[0].inboxId)))
  assert.equal((await points.account(buyer.id)).available, '0')
  const accepted = await receipt(buyer, row, token)
  await payments.processInbox(accepted.inboxId)
  assert.equal((await points.account(buyer.id)).available, '1100')
  const other = await user()
  await assert.rejects(receipt(other, row, token), /不存在/)
})

test('错SKU/账号/订单/数量/环境均不履约；商店取消不消耗首单', async () => {
  for (const fields of [{ productId: 'other.sku' }, { storeAccountId: randomUUID() }, { paidAt: new Date(0) }, { quantity: '2' }]) {
    const buyer = await user()
    const { row, parameters } = await order(buyer, await pack(), 'google')
    const accepted = await receipt(buyer, row, purchase(row, parameters, fields))
    await payments.processInbox(accepted.inboxId)
    assert.equal((await source.query('SELECT status FROM biz_payment_inbox WHERE id=$1', [accepted.inboxId]))[0].status, 'review')
    assert.equal((await points.account(buyer.id)).available, '0')
  }
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'google')
  const token = purchase(row, parameters, { state: 'closed', paidAt: null })
  const accepted = await receipt(buyer, row, token)
  await payments.processInbox(accepted.inboxId)
  assert.equal((await orders.get(buyer.id, row.id)).status, 'closed')
  assert.equal((await source.query('SELECT first_order_id FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id]))[0].first_order_id, null)
})

test('Apple迟到验真仍按固定旧版本履约；无绑定历史交易仅待审', async () => {
  const buyer = await user()
  const pkg = await pack()
  const { row, parameters } = await order(buyer, pkg, 'apple')
  await catalog.publishPackage(pkg.id, 'disabled')
  const credential = purchase(row, parameters)
  const accepted = await receipt(buyer, row, credential)
  await payments.processInbox(accepted.inboxId)
  assert.equal((await orders.get(buyer.id, row.id)).status, 'paid')
  assert.equal((await points.account(buyer.id)).available, '1100')
  const orphan = purchase(row, parameters, { bindingToken: null })
  const notice = await payments.acceptApple(orphan)
  await payments.processInbox(notice.inboxId)
  assert.equal((await source.query('SELECT status,reason FROM biz_payment_inbox WHERE id=$1', [notice.inboxId]))[0].status, 'review')
  assert.equal((await points.account(buyer.id)).available, '1100')
})
