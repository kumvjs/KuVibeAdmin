/* eslint-disable antfu/no-import-dist -- 隔离PostgreSQL验证持久支付规则；商店网络使用明确契约替身。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { DecoupleIapPaymentRecords1790992800000 } from '../dist/src/migrations/1790992800000-decouple-iap-payment-records.js'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { OrderReservationEntity } from '../dist/src/modules/billing/orders/entities/order-reservation.entity.js'
import { RechargeOrderEntity } from '../dist/src/modules/billing/orders/entities/recharge-order.entity.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { PaymentAttemptEntity } from '../dist/src/modules/billing/payments/entities/payment-attempt.entity.js'
import { PaymentSecretsService } from '../dist/src/modules/billing/payments/payment-secrets.service.js'
import { PaymentsService } from '../dist/src/modules/billing/payments/payments.service.js'
import { SettlementService } from '../dist/src/modules/billing/payments/settlement.service.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { RefundsService } from '../dist/src/modules/billing/refunds/refunds.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
assert.equal(process.env.IAP_ISOLATED_TEST, 'true', '仅在本次独立容器运行，不能使用共享业务库')
const code = () => `record_${randomUUID().replaceAll('-', '')}`
const proofs = new Map()
const binding = (applicationId, environment) => ({ applicationId, merchantId: applicationId, environment })
let source, actor, catalog, quotas, orders, points, payments, outbox
const apple = {
  binding,
  query: async (_app, _env, key) => proofs.get(key),
  notification: async key => ({ payment: proofs.get(key), type: 'ONE_TIME_CHARGE', hash: createHash('sha256').update(`apple:${key}:${proofs.get(key).state}`).digest('hex'), applicationId: 'test.app', environment: 'sandbox' }),
}
const google = {
  binding,
  query: async (_app, environment, key) => {
    const payment = proofs.get(key)
    if (payment.environment !== environment)
      throw new Error('wrong_environment')
    return { payment, consumed: false }
  },
  notification: async key => ({ token: key, applicationId: 'test.app', type: 'one_time', hash: createHash('sha256').update(`google:${key}:${proofs.get(key).state}`).digest('hex') }),
  consume: async () => {},
}
async function user() {
  return source.getRepository(SysUserEntity).save({ username: code(), name: '隔离内购流水测试', passwordHash: '$argon2id$fixture' })
}
async function pack(fields = {}) {
  const row = await catalog.createPackage({ code: code(), title: '基础商品及活动上下文', priceMinor: '990', basePoints: '100', giftPoints: '0', ...fields }, actor.id)
  await catalog.publishPackage(row.id, 'enabled')
  return row
}
const map = (pkg, channel, productId = code()) => catalog.mapProduct({ versionId: pkg.versionId, channel, applicationId: 'test.app', environment: 'sandbox', productId }, actor.id)
async function order(buyer, pkg, channel, product) {
  product ??= await map(pkg, channel)
  const row = await orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel, channelProductId: product.id, client: 'app', idempotencyKey: code() })
  const prepared = await payments.prepare(buyer.id, row.id)
  return { row, parameters: prepared.parameters }
}
function purchase(channel, parameters, fields = {}) {
  const key = channel === 'apple' ? String(BigInt(`0x${randomUUID().replaceAll('-', '')}`)) : code()
  const payment = { channel, transactionKey: channel === 'apple' ? `sandbox:test.app:${key}` : createHash('sha256').update(key).digest('hex'), merchantNo: null, ...binding('test.app', 'sandbox'), state: 'paid', amountMinor: null, currency: 'CNY', productId: parameters.productId, bindingToken: parameters.appAccountToken ?? null, storeAccountId: parameters.obfuscatedAccountId ?? null, quantity: '1', paidAt: new Date(), evidenceHash: createHash('sha256').update(key).digest('hex'), ...fields }
  proofs.set(key, payment)
  return key
}
const receipt = (buyer, row, key) => payments.receipt(buyer.id, row.id, row.channel === 'apple' ? { transactionId: key } : { purchaseToken: key })
const transaction = async key => (await source.query('SELECT * FROM biz_payment_transaction WHERE transaction_key=$1', [proofs.get(key).transactionKey]))[0]
const notice = (channel, key) => channel === 'apple' ? payments.acceptApple(key) : payments.acceptGoogle(key)

before(async () => {
  const baseline = readdirSync('dist/src/migrations').filter(name => name.endsWith('.js') && !name.startsWith('1790992800000')).map(name => `dist/src/migrations/${name}`)
  source = await new DataSource({ type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: baseline, synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }).initialize()
  await source.runMigrations()
  quotas = new QuotaService()
  catalog = new CatalogService(source, quotas)
  orders = new OrdersService(source, catalog, quotas, outbox = new BillingOutboxService(source))
  points = new PointsService(source)
  actor = await user()
  const legacy = []
  for (const fulfilled of [false, true]) {
    const buyer = await user()
    const pkg = await pack()
    const row = await orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel: 'wechat', client: 'qr', payableMinor: '990', idempotencyKey: code() })
    const facts = { channel: 'wechat', transactionKey: code(), state: 'paid', applicationId: 'legacy.app', merchantId: 'legacy.merchant', environment: 'production', amountMinor: '990', currency: 'CNY', productId: null, bindingToken: null, merchantNo: row.merchantNo, quantity: '1', paidAt: new Date().toISOString(), evidenceHash: 'a'.repeat(64) }
    const [saved] = await source.query(`INSERT INTO biz_payment_transaction(order_id,channel,transaction_key,facts,bonus_points) VALUES($1,'wechat',$2,$3,0) RETURNING id::text`, [row.id, facts.transactionKey, facts])
    if (fulfilled) {
      const grant = await points.execute({ userId: buyer.id, action: 'grant', kind: 'paid', amount: '100', businessType: 'migration_fixture', businessKey: code(), actorId: actor.id, reason: '迁移历史入账证据' })
      await source.query(`UPDATE biz_recharge_order SET status='paid',paid_ledger_id=$2,settled_at=now() WHERE id=$1`, [row.id, grant.id])
    }
    legacy.push({ id: saved.id, facts, status: fulfilled ? 'fulfilled' : 'review' })
  }
  const migration = new DecoupleIapPaymentRecords1790992800000()
  for (const action of ['up', 'down', 'up']) {
    await source.transaction(manager => migration[action](manager.queryRunner))
    for (const row of legacy) {
      const [current] = await source.query('SELECT * FROM biz_payment_transaction WHERE id=$1', [row.id])
      assert.deepEqual(current.facts, row.facts)
      if (action === 'up')
        assert.equal(current.status, row.status)
    }
  }
  await source.query('INSERT INTO migrations(timestamp,name) VALUES($1,$2)', [1790992800000, migration.name])
  console.log('迁移：两种历史状态保留，up/down/up通过')
  const secrets = new PaymentSecretsService({ dataKey: () => ({ key: Buffer.alloc(32, 47), id: 'fixture' }) })
  const refunds = new RefundsService(source, orders, points, outbox, {}, {})
  const settlement = new SettlementService(source, catalog, orders, quotas, points, outbox, refunds)
  payments = new PaymentsService(source, catalog, orders, outbox, settlement, {}, {}, apple, google, secrets, refunds)
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('同SKU引用多套餐与新版本，订单分别固定赠分；不允许改变基础权益或覆写映射', async () => {
  const sku = code()
  const a = await pack({ giftPoints: '10' })
  const b = await pack({ giftPoints: '50' })
  const pa = await map(a, 'apple', sku)
  const pb = await map(b, 'apple', sku)
  const buyer = await user()
  const purchases = [await order(buyer, a, 'apple', pa), await order(buyer, b, 'apple', pb)]
  for (const { row, parameters } of purchases) {
    const accepted = await receipt(buyer, row, purchase('apple', parameters))
    await payments.processInbox(accepted.inboxId)
  }
  assert.equal((await points.account(buyer.id)).available, '260')
  const revised = await catalog.revisePackage(a.id, { title: '新赠送版本', priceMinor: '990', basePoints: '100', giftPoints: '25' }, actor.id)
  await map(revised, 'apple', sku)
  await assert.rejects(map(revised, 'apple', sku), /已存在/)
  await assert.rejects(map(await pack({ basePoints: '200' }), 'apple', sku), /基础权益/)
  await assert.rejects(source.query('UPDATE biz_channel_product SET product_id=$2 WHERE id=$1', [pa.id, code()]), /不可/)
})

test('四渠道30分钟；内购零额度拒绝，下单并发跨渠道总量及用户额度不超售', async () => {
  const blocked = await pack({ totalLimit: '0' })
  for (const channel of ['apple', 'google']) await assert.rejects(order(await user(), blocked, channel), /限量|限购/)
  const pkg = await pack({ totalLimit: '3', dailyLimit: '3', userTotalLimit: '1', userDailyLimit: '1' })
  const products = { apple: await map(pkg, 'apple'), google: await map(pkg, 'google') }
  const attempts = await Promise.allSettled(Array.from({ length: 24 }, async (_v, i) => {
    const buyer = await user()
    return orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel: i % 2 ? 'apple' : 'google', channelProductId: products[i % 2 ? 'apple' : 'google'].id, client: 'app', idempotencyKey: code() })
  }))
  assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 3)
  for (const item of attempts.filter(row => row.status === 'fulfilled')) {
    assert.equal(new Date(item.value.expiresAt) - new Date(item.value.createdAt), 1800000)
    assert.equal((await source.query('SELECT count(*) FROM biz_order_reservation WHERE order_id=$1 AND status=\'held\'', [item.value.id]))[0].count, '4')
  }
  const buyer = await user()
  const limited = await pack({ userTotalLimit: '1' })
  await order(buyer, limited, 'apple')
  await assert.rejects(order(buyer, limited, 'google'), /限量|限购/)
  const cash = await pack()
  const row = await orders.create((await user()).id, { packageId: cash.id, versionId: cash.versionId, channel: 'wechat', client: 'qr', payableMinor: '990', idempotencyKey: code() })
  assert.equal(new Date(row.expiresAt) - new Date(row.createdAt), 1800000)
})

test('Apple/Google无绑定并发通知唯一落流水，不建订单、不发分，退款不被旧付款覆盖', async () => {
  for (const channel of ['apple', 'google']) {
    const key = purchase(channel, { productId: code() }, { bindingToken: null, storeAccountId: null })
    const [{ count: beforeCount }] = await source.query('SELECT count(*) FROM biz_recharge_order')
    const accepted = await notice(channel, key)
    await Promise.all(Array.from({ length: 12 }, () => payments.processInbox(accepted.inboxId)))
    const row = await transaction(key)
    assert.equal(row.order_id, null)
    assert.equal(row.status, 'unmatched')
    assert.equal((await source.query('SELECT count(*) FROM biz_recharge_order'))[0].count, beforeCount)
    const old = { ...proofs.get(key) }
    proofs.set(key, { ...old, state: 'refunded', refundScope: 'full' })
    await payments.processInbox((await notice(channel, key)).inboxId)
    assert.equal((await transaction(key)).latest_facts.state, 'refunded')
    proofs.set(key, old)
    await payments.processInbox(accepted.inboxId, true)
    assert.equal((await transaction(key)).latest_facts.state, 'refunded')
    assert.equal((await transaction(key)).facts.state, 'paid')
    await assert.rejects(source.query('UPDATE biz_payment_transaction SET facts=$2 WHERE id=$1', [row.id, {}]), /不可/)
  }
})

test('Google按稳定账号绑定，通知先到保持未匹配；客户端补报原订单只发一次，旧token不得充值新订单', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'google')
  assert.equal(parameters.obfuscatedProfileId, undefined)
  const key = purchase('google', parameters)
  const first = await notice('google', key)
  await payments.processInbox(first.inboxId)
  assert.equal((await transaction(key)).order_id, null)
  assert.equal((await points.account(buyer.id)).available, '0')
  const accepted = await receipt(buyer, row, key)
  await Promise.all(Array.from({ length: 12 }, () => payments.processInbox(accepted.inboxId)))
  assert.equal((await points.account(buyer.id)).available, '100')
  assert.equal((await transaction(key)).status, 'fulfilled')
  const next = await order(buyer, await pack(), 'google')
  assert.equal(next.parameters.obfuscatedAccountId, parameters.obfuscatedAccountId)
  const oldKey = purchase('google', next.parameters, { paidAt: new Date(0) })
  await payments.processInbox((await receipt(buyer, next.row, oldKey)).inboxId)
  assert.equal((await transaction(oldKey)).status, 'review')
  assert.equal((await points.account(buyer.id)).available, '100')
})

test('Google同SKU不同套餐不能同时创建购买意图，防止多种活动上下文争用', async () => {
  const buyer = await user()
  const sku = code()
  const a = await pack()
  const b = await pack({ giftPoints: '20' })
  await order(buyer, a, 'google', await map(a, 'google', sku))
  await assert.rejects(order(buyer, b, 'google', await map(b, 'google', sku)), /购买意图/)
})

test('Apple自动恢复只认原UUID；旧客户端无订单补报不会将申报人当作购买归属', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'apple')
  const key = purchase('apple', parameters)
  const accepted = await payments.restore(buyer.id, 'apple', { applicationId: 'test.app', environment: 'sandbox', transactionId: key })
  await payments.processInbox(accepted.inboxId)
  assert.equal((await orders.get(buyer.id, row.id)).status, 'paid')
  const orphan = purchase('apple', parameters, { bindingToken: null })
  const missing = await payments.restore(buyer.id, 'apple', { applicationId: 'test.app', environment: 'sandbox', transactionId: orphan })
  await payments.processInbox(missing.inboxId)
  assert.equal((await transaction(orphan)).order_id, null)
  assert.equal((await points.account(buyer.id)).available, '100')
  await assert.rejects(payments.restore(buyer.id, 'apple', { applicationId: 'test.app', environment: 'sandbox', transactionReceipt: 'not-a-receipt' }), /收据|交易ID/)
})

test('人工关联需有效订单和无矛盾绑定，原因不可改写；另行查验后一次履约', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'apple')
  const key = purchase('apple', parameters, { bindingToken: null })
  const accepted = await notice('apple', key)
  await payments.processInbox(accepted.inboxId)
  const payment = await transaction(key)
  await assert.rejects(payments.bindTransaction(payment.id, row.id, actor.id, ' '), /依据/)
  await payments.bindTransaction(payment.id, row.id, actor.id, '客服核对原账号、平台付款及业务订单')
  assert.equal((await points.account(buyer.id)).available, '0')
  await payments.recoverTransaction(payment.id, false)
  await payments.recoverTransaction(payment.id, false)
  assert.equal((await points.account(buyer.id)).available, '100')
  assert.equal((await transaction(key)).manual_binding.actorId, actor.id)
  await assert.rejects(source.query('UPDATE biz_payment_transaction SET manual_binding=$2 WHERE id=$1', [payment.id, {}]), /不可/)
  const next = await order(buyer, await pack(), 'apple')
  const wrong = purchase('apple', next.parameters, { bindingToken: randomUUID() })
  await payments.processInbox((await notice('apple', wrong)).inboxId)
  await assert.rejects(payments.bindTransaction((await transaction(wrong)).id, next.row.id, actor.id, '不可覆盖矛盾UUID'), /矛盾绑定/)
})

test('预占已过期但worker尚未执行时，迟到款仍不履约，释放一次并保留付款', async () => {
  const buyer = await user()
  const initial = await order(buyer, await pack(), 'apple')
  const original = await source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: initial.row.id })
  let late, parameters
  await source.transaction(async (manager) => {
    // 新建代表性历史时间记录，保留不可变触发器；不篡改已有订单期限。
    late = await manager.getRepository(RechargeOrderEntity).save({ ...original, id: undefined, createdAt: new Date(Date.now() - 1860000), merchantNo: randomUUID().replaceAll('-', ''), idempotencyKey: code(), expiresAt: new Date(Date.now() - 60000), paymentInitiated: true })
    const attempt = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId: original.id })
    const uuid = randomUUID()
    parameters = { ...attempt.parameters, appAccountToken: uuid }
    await manager.getRepository(PaymentAttemptEntity).save({ orderId: late.id, storeToken: uuid, binding: attempt.binding, parameters, status: 'ready' })
    const demands = await manager.query('SELECT resource_key AS "resourceKey",period_key AS "periodKey","limit"::text AS "limit",\'1\' AS amount FROM biz_quota_bucket WHERE id IN (SELECT bucket_id FROM biz_order_reservation WHERE order_id=$1)', [original.id])
    const reserved = await quotas.reserve(manager, demands)
    await manager.getRepository(OrderReservationEntity).insert(reserved.map(item => ({ orderId: late.id, bucketId: item.bucketId, amount: item.amount, purpose: 'package', status: 'held' })))
  })
  const key = purchase('apple', parameters)
  const accepted = await receipt(buyer, late, key)
  await payments.processInbox(accepted.inboxId)
  assert.equal((await orders.get(buyer.id, late.id)).status, 'review')
  assert.equal((await transaction(key)).reason, 'late_payment_after_local_close')
  assert.equal((await points.account(buyer.id)).available, '0')
  await orders.expire(late.id)
  await payments.processInbox(accepted.inboxId, true)
  assert.equal((await source.query('SELECT count(*) FROM biz_order_reservation WHERE order_id=$1 AND status=\'released\'', [late.id]))[0].count, '4')
  await assert.rejects(payments.bindTransaction((await transaction(key)).id, late.id, actor.id, '旧单不能恢复库存'), /迟到旧单/)
})

test('旧Google profile UUID意图保持RTDN自动定位与原归属校验，不改写历史参数', async () => {
  const buyer = await user()
  const pkg = await pack()
  const product = await map(pkg, 'google')
  const row = await orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel: 'google', channelProductId: product.id, client: 'app', idempotencyKey: code() })
  const storeToken = randomUUID()
  const storeAccountId = randomUUID()
  const parameters = { productId: product.productId, obfuscatedAccountId: storeAccountId, obfuscatedProfileId: storeToken }
  await source.getRepository(PaymentAttemptEntity).save({ orderId: row.id, storeToken, binding: { ...binding('test.app', 'sandbox'), storeAccountId }, status: 'ready', parameters })
  await source.getRepository(RechargeOrderEntity).update(row.id, { paymentInitiated: true })
  const key = purchase('google', parameters, { bindingToken: storeToken })
  await payments.processInbox((await notice('google', key)).inboxId)
  assert.equal((await orders.get(buyer.id, row.id)).status, 'paid')
  assert.equal((await transaction(key)).order_id, row.id)
  assert.equal((await source.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId: row.id })).binding.googleOrderMode, undefined)
})

test('退款与旧付款重复提交仍无余额；新模型使用后down拒绝，schema实体无残余差异', async () => {
  const buyer = await user()
  const { row, parameters } = await order(buyer, await pack(), 'google')
  const key = purchase('google', parameters)
  const accepted = await receipt(buyer, row, key)
  await payments.processInbox(accepted.inboxId)
  const original = { ...proofs.get(key) }
  proofs.set(key, { ...original, state: 'refunded', refundScope: 'full', storeAccountId: null })
  await payments.processInbox((await notice('google', key)).inboxId)
  assert.equal((await points.account(buyer.id)).available, '0')
  proofs.set(key, original)
  await payments.processInbox(accepted.inboxId, true)
  assert.equal((await points.account(buyer.id)).available, '0')
  assert.equal((await orders.get(buyer.id, row.id)).status, 'refunded')
  await assert.rejects(source.transaction(manager => new DecoupleIapPaymentRecords1790992800000().down(manager.queryRunner)), /拒绝/)
  const diff = await source.driver.createSchemaBuilder().log()
  assert.deepEqual(diff.upQueries.map(row => row.query), [])
})
