/* eslint-disable antfu/no-import-dist -- 真实PostgreSQL支付结算与迁移验证，渠道网络用明确的契约替身。 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { AddPaymentProcessing1790753142319 } from '../dist/src/migrations/1790753142319-add-payment-processing.js'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { PaymentConfigService } from '../dist/src/modules/billing/payments/payment-config.service.js'
import { PaymentSecretsService } from '../dist/src/modules/billing/payments/payment-secrets.service.js'
import { decimalToMinor, minorToDecimal } from '../dist/src/modules/billing/payments/payment.types.js'
import { PaymentsService } from '../dist/src/modules/billing/payments/payments.service.js'
import { SettlementService } from '../dist/src/modules/billing/payments/settlement.service.js'
import { verifyWechatMessage } from '../dist/src/modules/billing/payments/wechat.provider.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
const config = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }
let source, catalog, orders, outbox, points, settlement, payments, actor
const code = () => `pay_${randomUUID().replaceAll('-', '')}`
const binding = { applicationId: 'wx1234567890abc', merchantId: '1234567890', environment: 'production' }
const provider = {
  binding: () => binding,
  prepare: async () => ({ codeUrl: 'weixin://fixture' }),
  query: async () => {
    throw new Error('contract_unknown')
  },
  close: async () => {},
}
async function user() {
  return source.getRepository(SysUserEntity).save({ username: code(), name: '支付测试用户', passwordHash: '$argon2id$fixture' })
}
async function pack(fields = {}) {
  const row = await catalog.createPackage({ code: code(), title: '支付测试套餐', priceMinor: '1000', basePoints: '1000', giftPoints: '100', ...fields }, actor.id)
  await catalog.publishPackage(row.id, 'enabled')
  return row
}
async function order(buyer, row, channel = 'wechat') {
  return orders.create(buyer.id, { packageId: row.id, versionId: row.versionId, channel, client: 'qr', idempotencyKey: randomUUID(), payableMinor: row.priceMinor })
}
function proof(row, fields = {}) {
  return { channel: row.channel, transactionKey: code(), merchantNo: row.merchantNo, ...binding, state: 'paid', amountMinor: row.payableMinor, currency: 'CNY', productId: null, bindingToken: null, quantity: '1', paidAt: new Date(), evidenceHash: createHash('sha256').update(code()).digest('hex'), ...fields }
}
async function promotion(packageId, fields = {}) {
  const row = await catalog.createPromotion({ code: code(), title: '首单结算赠分', startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), effect: 'bonus_fixed', value: '500', eligibility: 'first_user', channels: ['wechat', 'alipay'], packageIds: [packageId], minimumMinor: '0', requiresCoupon: false, priority: 1, ...fields }, actor.id)
  await catalog.publishPromotion(row.id, 'enabled')
  return row
}
before(async () => {
  source = await new DataSource(config).initialize()
  await source.runMigrations()
  const quotas = new QuotaService()
  catalog = new CatalogService(source, quotas)
  orders = new OrdersService(source, catalog, quotas, outbox = new BillingOutboxService(source))
  points = new PointsService(source)
  settlement = new SettlementService(source, catalog, orders, quotas, points, outbox)
  payments = new PaymentsService(source, catalog, orders, outbox, settlement, provider, provider)
  actor = await user()
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('金额整数精度、微信签名篡改/过期/未知公钥拒绝，凭据AES-GCM绑定上下文', () => {
  assert.equal(decimalToMinor('90071992547409.91'), '9007199254740991')
  assert.equal(minorToDecimal('9007199254740991'), '90071992547409.91')
  for (const value of ['1e2', '-1', '01.00', '1.001', 1, null]) assert.throws(() => decimalToMinor(value))
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const now = Date.now()
  const timestamp = String(Math.floor(now / 1000))
  const body = '{"amount":1}'
  const headers = { 'wechatpay-serial': 'test-key', 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': 'nonce', 'wechatpay-signature': sign('RSA-SHA256', Buffer.from(`${timestamp}\nnonce\n${body}\n`), privateKey).toString('base64') }
  const keys = { 'test-key': publicKey.export({ type: 'spki', format: 'pem' }) }
  verifyWechatMessage(body, headers, keys, now)
  assert.throws(() => verifyWechatMessage('{"amount":2}', headers, keys, now), /验签/)
  assert.throws(() => verifyWechatMessage(body, headers, keys, now + 301000), /时间窗口/)
  assert.throws(() => verifyWechatMessage(body, { ...headers, 'wechatpay-serial': 'unknown' }, keys, now), /公钥/)
  const secrets = new PaymentSecretsService({ dataKey: () => ({ key: Buffer.alloc(32, 42), id: 'fixture' }) })
  const secret = secrets.seal('private-purchase-token', 'google:test.app')
  assert.ok(!JSON.stringify(secret).includes('private-purchase-token'))
  assert.equal(secrets.open(secret, 'google:test.app'), 'private-purchase-token')
  assert.throws(() => secrets.open(secret, 'google:other.app'))
})

test('默认未配置渠道不可发起支付，不写尝试/任务、不改变原订单', async () => {
  const disabled = new PaymentsService(source, catalog, orders, outbox, settlement, { binding: () => new PaymentConfigService().require(undefined) }, provider)
  const buyer = await user()
  const row = await order(buyer, await pack())
  await assert.rejects(disabled.prepare(buyer.id, row.id), /尚未配置/)
  assert.equal((await source.query('SELECT id FROM biz_payment_attempt WHERE order_id=$1', [row.id])).length, 0)
  assert.equal((await points.account(buyer.id)).available, '0')
  await orders.cancel(buyer.id, row.id)
})

test('管理订单按用户/状态/渠道/商户号筛选并分页，本人查询保持隔离', async () => {
  const [buyer, other] = await Promise.all([user(), user()])
  const pkg = await pack()
  const first = await order(buyer, pkg, 'wechat')
  await orders.cancel(buyer.id, first.id)
  const second = await order(buyer, pkg, 'alipay')
  const foreign = await order(other, pkg, 'wechat')
  const page = await orders.listSystem({ userId: buyer.id }, undefined, 1)
  assert.deepEqual(page.items.map(row => row.id), [second.id])
  assert.ok(page.nextCursor)
  assert.deepEqual((await orders.listSystem({ userId: buyer.id }, page.nextCursor, 1)).items.map(row => row.id), [first.id])
  assert.deepEqual((await orders.listSystem({ userId: buyer.id, channel: 'wechat', status: 'closed', merchantNo: first.merchantNo })).items.map(row => row.id), [first.id])
  assert.deepEqual((await orders.listSystem({ userId: buyer.id, merchantNo: foreign.merchantNo })).items, [])
  assert.deepEqual((await orders.list(buyer.id)).items.map(row => row.id), [second.id, first.id])
  await assert.rejects(orders.get(buyer.id, foreign.id), /不存在/)
  await orders.cancel(buyer.id, second.id)
  await orders.cancel(other.id, foreign.id)
})

test('100次并发同一真实结算事务只发一份权益、两条流水和一次首单/库存核销', async () => {
  const buyer = await user()
  const pkg = await pack({ dailyLimit: '1' })
  const command = { packageId: pkg.id, versionId: pkg.versionId, channel: 'wechat', client: 'qr', idempotencyKey: randomUUID(), payableMinor: pkg.priceMinor }
  const row = await orders.create(buyer.id, command)
  const prepared = await Promise.all(Array.from({ length: 30 }, () => payments.prepare(buyer.id, row.id)))
  assert.ok(prepared.every(result => result.status === 'queued'))
  assert.equal((await source.query(`SELECT count(*)::int AS n FROM biz_billing_outbox WHERE type='payment_prepare' AND aggregate_id=$1`, [row.id]))[0].n, 1)
  await payments.processPrepare(row.id)
  assert.equal((await payments.prepare(buyer.id, row.id)).status, 'ready')
  const payment = proof(row)
  const accepted = await Promise.all(Array.from({ length: 30 }, () => payments.acceptCash(payment)))
  assert.equal(new Set(accepted.map(item => item.inboxId)).size, 1)
  const results = await Promise.all(Array.from({ length: 100 }, () => payments.processInbox(accepted[0].inboxId)))
  assert.equal(results.length, 100)
  assert.equal((await points.account(buyer.id)).available, '1100')
  const credited = await orders.get(buyer.id, row.id)
  assert.equal(credited.settlement.basePoints, '1000')
  assert.equal(credited.settlement.giftPoints, '100')
  assert.equal(credited.settlement.bonusPoints, '0')
  assert.deepEqual((await orders.create(buyer.id, command)).settlement, credited.settlement)
  assert.deepEqual((await orders.list(buyer.id)).items[0].settlement, credited.settlement)
  const [state] = await source.query('SELECT first_order_id::text,settlement_sequence::text,current_order_id FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id])
  assert.deepEqual(state, { first_order_id: row.id, settlement_sequence: '1', current_order_id: null })
  assert.equal((await source.query(`SELECT count(*)::int AS n FROM biz_point_ledger l JOIN biz_point_account a ON l.account_id=a.id WHERE a.user_id=$1`, [buyer.id]))[0].n, 2)
  assert.deepEqual((await source.query('SELECT reserved::text,sold::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${pkg.id}:daily`]))[0], { reserved: '0', sold: '1' })
  await assert.rejects(source.query('UPDATE biz_recharge_order SET paid_ledger_id=NULL WHERE id=$1', [row.id]), /不可重置/)
  await assert.rejects(source.query(`UPDATE biz_recharge_order SET status='pending' WHERE id=$1`, [row.id]), /禁止回退/)
  await assert.rejects(source.query(`DELETE FROM biz_payment_transaction WHERE order_id=$1`, [row.id]), /不可修改|不可删除|不可变/)
})

test('金额/商户/环境/数量不匹配均转通知待审，不得改变余额和订单', async () => {
  const buyer = await user()
  const row = await order(buyer, await pack())
  await payments.prepare(buyer.id, row.id)
  for (const fields of [{ amountMinor: '999' }, { currency: 'USD' }, { merchantId: 'foreign' }, { environment: 'sandbox' }, { quantity: '2' }]) {
    const accepted = await payments.acceptCash(proof(row, fields))
    await payments.processInbox(accepted.inboxId)
    assert.equal((await source.query('SELECT status FROM biz_payment_inbox WHERE id=$1', [accepted.inboxId]))[0].status, 'review')
  }
  assert.equal((await orders.get(buyer.id, row.id)).status, 'pending')
  assert.equal((await points.account(buyer.id)).available, '0')
  await orders.cancel(buyer.id, row.id)
})

test('交易不能跨用户领取；同订单第二笔交易转待审；已付重试不再发放', async () => {
  const pkg = await pack()
  const [buyer, other] = await Promise.all([user(), user()])
  const row = await order(buyer, pkg)
  const second = await order(other, pkg)
  await payments.prepare(buyer.id, row.id)
  await payments.prepare(other.id, second.id)
  const payment = proof(row)
  assert.equal((await settlement.settle(row.id, payment)).status, 'paid')
  assert.equal((await settlement.settle(second.id, { ...payment, merchantNo: second.merchantNo })).status, 'review')
  assert.equal((await settlement.settle(row.id, proof(row))).status, 'review')
  assert.equal((await points.account(buyer.id)).available, '1100')
  assert.equal((await points.account(other.id)).available, '0')
  await orders.cancel(other.id, second.id)
})

test('首单赠分按入账判定；跨渠道只中一次；预算竞争失败兑现基础权益', async () => {
  const pkg = await pack()
  await promotion(pkg.id, { pointsBudget: '500' })
  const buyers = await Promise.all(Array.from({ length: 20 }, () => user()))
  const rows = await Promise.all(buyers.map(buyer => order(buyer, pkg)))
  await Promise.all(rows.map((row, index) => payments.prepare(buyers[index].id, row.id)))
  await Promise.all(rows.map(row => settlement.settle(row.id, proof(row))))
  const balances = await Promise.all(buyers.map(buyer => points.account(buyer.id)))
  assert.equal(balances.filter(item => item.available === '1600').length, 1)
  assert.equal(balances.filter(item => item.available === '1100').length, 19)
  const second = await order(buyers[0], pkg, 'alipay')
  await payments.prepare(buyers[0].id, second.id)
  await settlement.settle(second.id, proof(second))
  const transaction = (await source.query('SELECT bonus_points::text FROM biz_payment_transaction WHERE order_id=$1', [second.id]))[0]
  assert.equal(transaction.bonus_points, '0')
})

test('首单券结算时复核券次数，十人共享限一次券仅一人获赠', async () => {
  const pkg = await pack()
  const promo = await promotion(pkg.id, { requiresCoupon: true })
  const couponCode = code()
  const coupon = await catalog.createCoupon({ promotionId: promo.id, code: couponCode, totalLimit: '1', startsAt: new Date(Date.now() - 10000).toISOString(), endsAt: new Date(Date.now() + 1800000).toISOString() }, actor.id)
  const buyers = await Promise.all(Array.from({ length: 10 }, () => user()))
  const rows = await Promise.all(buyers.map(buyer => orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel: 'wechat', client: 'qr', payableMinor: pkg.priceMinor, idempotencyKey: randomUUID(), couponCode })))
  await Promise.all(rows.map((row, index) => payments.prepare(buyers[index].id, row.id)))
  await Promise.all(rows.map(row => settlement.settle(row.id, proof(row))))
  const balances = await Promise.all(buyers.map(buyer => points.account(buyer.id)))
  assert.equal(balances.filter(item => item.available === '1600').length, 1)
  assert.equal(balances.filter(item => item.available === '1100').length, 9)
  assert.deepEqual((await source.query('SELECT reserved::text,sold::text FROM biz_quota_bucket WHERE resource_key=$1', [`coupon:${coupon.id}:total`]))[0], { reserved: '0', sold: '1' })
})

test('冻结用户的历史已付订单仍履约；中途失败整体回滚并可原凭据重试', async () => {
  const buyer = await user()
  const pkg = await pack()
  const row = await order(buyer, pkg)
  await payments.prepare(buyer.id, row.id)
  await source.getRepository(SysUserEntity).softDelete(buyer.id)
  await source.query(`CREATE FUNCTION payment_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id=${row.id} THEN RAISE EXCEPTION 'payment_fixture_failure'; END IF; RETURN NEW; END; $$`)
  await source.query('CREATE TRIGGER payment_fixture_failure BEFORE INSERT ON biz_payment_transaction FOR EACH ROW EXECUTE FUNCTION payment_fixture_failure()')
  const payment = proof(row)
  try {
    await assert.rejects(settlement.settle(row.id, payment), /payment_fixture_failure/)
  }
  finally {
    await source.query('DROP TRIGGER payment_fixture_failure ON biz_payment_transaction')
    await source.query('DROP FUNCTION payment_fixture_failure()')
  }
  assert.equal((await points.account(buyer.id)).available, '0')
  assert.equal((await orders.get(buyer.id, row.id)).status, 'pending')
  assert.equal((await source.query('SELECT reserved::text,sold::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${pkg.id}:total`]))[0].reserved, '1')
  await settlement.settle(row.id, payment)
  assert.equal((await points.account(buyer.id)).available, '1100')
})

test('已启动的未知状态关单不释放；确认closed才释放；迟到成功保留待审不超卖', async () => {
  const buyer = await user()
  const pkg = await pack({ dailyLimit: '1' })
  const row = await order(buyer, pkg)
  await payments.prepare(buyer.id, row.id)
  await payments.processPrepare(row.id)
  await orders.cancel(buyer.id, row.id)
  await assert.rejects(payments.close(row.id), /contract_unknown/)
  assert.equal((await source.query('SELECT reserved::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${pkg.id}:daily`]))[0].reserved, '1')
  const original = provider.query
  provider.query = async () => proof(row, { state: 'closed', amountMinor: null, currency: null })
  try {
    await payments.close(row.id)
  }
  finally {
    provider.query = original
  }
  assert.equal((await orders.get(buyer.id, row.id)).status, 'closed')
  assert.equal((await source.query('SELECT reserved::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${pkg.id}:daily`]))[0].reserved, '0')
  assert.equal((await settlement.settle(row.id, proof(row))).status, 'review')
  assert.equal((await orders.get(buyer.id, row.id)).status, 'review')
  assert.equal((await points.account(buyer.id)).available, '0')
})

test('M4迁移保留历史积分与订单，空表往返、非空拒绝down、实体diff为空', async () => {
  const fixture = await new DataSource({ ...config, database: 'kuvibe_billing_test_migration', migrations: [], entities: ['dist/src/modules/{auth,user,system,upload}/**/*.entity.js', 'dist/src/modules/billing/{points,catalog,orders,payments}/**/*.entity.js'] }).initialize()
  const runner = fixture.createQueryRunner()
  try {
    await runner.startTransaction()
    for (const file of ['1789459958471-update-table', '1789491815418-update-table', '1789648814246-update-table', '1790744400000-add-tenant-id', '1790748558277-add-points-ledger', '1790750149907-add-recharge-catalog', '1790751057378-add-recharge-orders']) {
      const module = await import(`../dist/src/migrations/${file}.js`)
      await new (Object.values(module).find(value => typeof value === 'function'))().up(runner)
    }
    const [buyer] = await runner.query(`INSERT INTO sys_user(username,name,password_hash,created_at) VALUES ('payment_old','旧用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z') RETURNING id`)
    await new PointsService(fixture).executeInTransaction(runner.manager, { userId: buyer.id, actorId: buyer.id, action: 'grant', amount: '42', kind: 'paid', businessType: 'fixture', businessKey: randomUUID(), reason: '旧账本迁移保留验证' })
    const [pkg] = await runner.query(`INSERT INTO biz_recharge_package(code,status,current_revision) VALUES ('payment_old','disabled',1) RETURNING id`)
    const [oldOrder] = await runner.query(`INSERT INTO biz_recharge_order(user_id,package_id,merchant_no,idempotency_key,request_hash,channel,client,business_date,payable_minor,snapshot,expires_at) VALUES ($1,$2,'old_merchant','old_key','old_hash','wechat','qr','2020-01-01',100,'{}','2020-01-01T00:15:00.123456Z') RETURNING id`, [buyer.id, pkg.id])
    const snapshot = async () => (await runner.query(`SELECT json_build_object('users',(SELECT json_agg(row_to_json(u)) FROM sys_user u),'accounts',(SELECT json_agg(row_to_json(a)) FROM biz_point_account a),'ledger',(SELECT json_agg(row_to_json(l)) FROM biz_point_ledger l),'orders',(SELECT json_agg(row_to_json(o)) FROM biz_recharge_order o)) AS value`))[0].value
    const original = await snapshot()
    const migration = new AddPaymentProcessing1790753142319()
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](runner)
      assert.deepEqual(await snapshot(), original)
    }
    const createRunner = fixture.createQueryRunner.bind(fixture)
    const release = runner.release.bind(runner)
    fixture.createQueryRunner = () => runner
    runner.release = async () => {}
    try {
      assert.deepEqual((await fixture.driver.createSchemaBuilder().log()).upQueries.map(row => row.query), [])
    }
    finally {
      fixture.createQueryRunner = createRunner
      runner.release = release
    }
    await runner.query(`INSERT INTO biz_payment_attempt(order_id,store_token,binding) VALUES ($1,$2,'{}')`, [oldOrder.id, randomUUID()])
    await assert.rejects(migration.down(runner), /已有业务数据/)
    assert.equal((await runner.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name LIKE 'biz_payment_%' OR table_name='biz_store_identity'`))[0].n, 4)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await fixture.destroy()
  }
})
