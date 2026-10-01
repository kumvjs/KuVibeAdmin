/* eslint-disable antfu/no-import-dist -- 专用PostgreSQL验证连续充值的实际事务与迁移。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { AddRechargePackageStreak1790770200000 } from '../dist/src/migrations/1790770200000-add-recharge-package-streak.js'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { RechargePackageStreakEntity } from '../dist/src/modules/billing/catalog/entities/recharge-package-streak.entity.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { readRechargeStreak } from '../dist/src/modules/billing/catalog/recharge-streak.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { PaymentAttemptEntity } from '../dist/src/modules/billing/payments/entities/payment-attempt.entity.js'
import { SettlementService } from '../dist/src/modules/billing/payments/settlement.service.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
const config = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }
let source, catalog, orders, points, settlement, actor, businessTime
const code = () => `streak_${randomUUID().replaceAll('-', '')}`
const binding = { applicationId: 'streak.app', merchantId: 'streak.merchant', environment: 'sandbox', storeAccountId: 'streak.account' }
const dates = ['2026-09-28T04:00:00Z', '2026-09-29T04:00:00Z', '2026-09-30T04:00:00Z', '2026-10-01T04:00:00Z', '2026-10-03T04:00:00Z']
async function user() {
  return source.getRepository(SysUserEntity).save({ username: code(), name: '连续充值测试用户', passwordHash: '$argon2id$fixture' })
}
async function pack() {
  const pkg = await catalog.createPackage({ code: code(), title: '连续套餐', priceMinor: '1000', basePoints: '1000', giftPoints: '100' }, actor.id)
  await catalog.publishPackage(pkg.id, 'enabled')
  return pkg
}
async function promotion(pkg, fields = {}) {
  const result = await catalog.createPromotion({ code: code(), title: '连续充值赠送', startsAt: '2020-01-01T00:00:00Z', endsAt: '2035-01-01T00:00:00Z', effect: 'bonus_consecutive', maxConsecutiveDays: 3, dailyBonusPoints: ['10', '20', '30'], eligibility: 'always', channels: ['wechat', 'alipay', 'apple', 'google'], packageIds: [pkg.id], minimumMinor: '0', requiresCoupon: false, priority: 1, ...fields }, actor.id)
  await catalog.publishPromotion(result.id, 'enabled')
  return result
}
async function prepare(buyer, pkg, channel = 'wechat', product = null) {
  const row = await orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel, client: product ? 'app' : 'qr', idempotencyKey: randomUUID(), ...(product ? { channelProductId: product.id } : { payableMinor: pkg.priceMinor }) })
  const storeToken = randomUUID()
  await source.getRepository(PaymentAttemptEntity).save({ orderId: row.id, storeToken, binding })
  const payment = { ...binding, channel, transactionKey: code(), merchantNo: row.merchantNo, state: 'paid', amountMinor: row.payableMinor, currency: 'CNY', productId: product?.productId ?? null, bindingToken: product ? storeToken : null, quantity: '1', paidAt: new Date(), evidenceHash: createHash('sha256').update(code()).digest('hex') }
  return { row, payment }
}
async function pay(buyer, pkg, channel = 'wechat') {
  const { row, payment } = await prepare(buyer, pkg, channel)
  await settlement.settle(row.id, payment)
  return orders.get(buyer.id, row.id)
}
before(async () => {
  source = await new DataSource(config).initialize()
  await source.runMigrations()
  const createRunner = source.createQueryRunner.bind(source)
  source.createQueryRunner = (...args) => {
    const runner = createRunner(...args)
    const query = runner.query.bind(runner)
    // 只替换结算读取的服务器时钟，仍在真实PG事务中写入不可变成功事实。
    runner.query = (sql, ...args) => sql === 'SELECT clock_timestamp() AS now' && businessTime ? Promise.resolve([{ now: new Date(businessTime) }]) : query(sql, ...args)
    return runner
  }
  const quotas = new QuotaService()
  const outbox = new BillingOutboxService(source)
  catalog = new CatalogService(source, quotas)
  orders = new OrdersService(source, catalog, quotas, outbox)
  points = new PointsService(source)
  settlement = new SettlementService(source, catalog, orders, quotas, points, outbox)
  actor = await user()
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('每天首笔、跨渠道、逐日额度、超过上限持续最后额度、断一天重来，实付始终全额', async () => {
  const buyer = await user()
  const pkg = await pack()
  await promotion(pkg)
  await promotion(pkg, { effect: 'fixed_discount', value: '100', channels: ['wechat', 'alipay'] })
  const quote = await catalog.quote(pkg.id, { channel: 'wechat' }, buyer.id)
  assert.equal(quote.payableMinor, '1000')
  assert.equal(quote.estimatedBonusPoints, '10')
  assert.equal(quote.guaranteedBonusPoints, '0')
  let balance = 0n
  for (const [time, expected] of [[dates[0], '10'], [dates[0], '0'], [dates[1], '20'], [dates[2], '30'], [dates[3], '30'], [dates[4], '10']]) {
    businessTime = time
    const row = await pay(buyer, pkg, expected === '0' ? 'alipay' : 'wechat')
    assert.equal(row.payableMinor, '1000')
    assert.equal(row.settlement.bonusPoints, expected)
    balance += 1100n + BigInt(expected)
    assert.equal((await points.account(buyer.id)).available, balance.toString())
  }
  assert.equal((await readRechargeStreak(source.manager, buyer.id, pkg.id)).consecutiveDays, 1)
  businessTime = null
})

test('每单赠送、Apple/Google同用户并发成功只计一天，重复回调不重复发放', async () => {
  const buyer = await user()
  const pkg = await pack()
  await promotion(pkg, { consecutiveGrantMode: 'every_order' })
  const products = await Promise.all(['apple', 'google'].map(channel => catalog.mapProduct({ versionId: pkg.versionId, channel, applicationId: binding.applicationId, environment: 'sandbox', productId: code() }, actor.id)))
  const pairs = await Promise.all(products.map(product => prepare(buyer, pkg, product.channel, product)))
  businessTime = dates[0]
  await Promise.all(pairs.map(({ row, payment }) => settlement.settle(row.id, payment)))
  await Promise.all(Array.from({ length: 50 }, () => settlement.settle(pairs[0].row.id, pairs[0].payment)))
  assert.equal((await points.account(buyer.id)).available, '2220')
  assert.equal((await readRechargeStreak(source.manager, buyer.id, pkg.id)).consecutiveDays, 1)
  assert.equal((await catalog.quote(pkg.id, { channel: 'google', channelProductId: products[1].id }, buyer.id)).payableMinor, null)
  businessTime = dates[1]
  const next = await prepare(buyer, pkg, 'google', products[1])
  await settlement.settle(next.row.id, next.payment)
  assert.equal((await orders.get(buyer.id, next.row.id)).settlement.bonusPoints, '20')
  assert.equal((await readRechargeStreak(source.manager, buyer.id, pkg.id)).consecutiveDays, 2)
  businessTime = null
})

test('套餐独立计数、午夜采用入账日；待付/取消不计数，旧订单回放保留退款事实', async () => {
  const buyer = await user()
  const pkg = await pack()
  const other = await pack()
  await promotion(pkg)
  const cancelled = await prepare(buyer, pkg)
  await orders.cancel(buyer.id, cancelled.row.id)
  assert.equal(await readRechargeStreak(source.manager, buyer.id, pkg.id), null)
  businessTime = '2026-09-29T15:59:59Z'
  await pay(buyer, pkg)
  businessTime = '2026-09-29T16:00:00Z'
  const paid = await pay(buyer, pkg)
  assert.equal(paid.settlement.bonusPoints, '20')
  await pay(buyer, other)
  assert.equal((await readRechargeStreak(source.manager, buyer.id, other.id)).consecutiveDays, 1)
  // 模拟升级前已退款订单和尚未生成的派生状态；不删除任何付款或积分事实。
  await source.query(`UPDATE biz_recharge_order SET status='refunded' WHERE id=$1`, [paid.id])
  await source.getRepository(RechargePackageStreakEntity).delete({ userId: buyer.id, packageId: pkg.id })
  assert.deepEqual(await readRechargeStreak(source.manager, buyer.id, pkg.id), { lastBusinessDate: '2026-09-30', consecutiveDays: 2 })
  assert.equal((await pay(buyer, pkg)).settlement.bonusPoints, '0')
  businessTime = null
})

test('事务失败不推进连续事实或发分；相同凭据重试只发一次，预算竞争不超额', async () => {
  const buyer = await user()
  const pkg = await pack()
  await promotion(pkg, { pointsBudget: '10' })
  const first = await prepare(buyer, pkg)
  businessTime = dates[0]
  await source.query(`CREATE FUNCTION streak_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id=${first.row.id} THEN RAISE EXCEPTION 'streak_fixture_failure'; END IF; RETURN NEW; END; $$`)
  await source.query('CREATE TRIGGER streak_fixture_failure BEFORE INSERT ON biz_payment_transaction FOR EACH ROW EXECUTE FUNCTION streak_fixture_failure()')
  try {
    await assert.rejects(settlement.settle(first.row.id, first.payment), /streak_fixture_failure/)
  }
  finally {
    await source.query('DROP TRIGGER streak_fixture_failure ON biz_payment_transaction')
    await source.query('DROP FUNCTION streak_fixture_failure()')
  }
  assert.equal(await readRechargeStreak(source.manager, buyer.id, pkg.id), null)
  assert.equal((await points.account(buyer.id)).available, '0')
  const other = await user()
  const second = await prepare(other, pkg)
  await Promise.all([settlement.settle(first.row.id, first.payment), settlement.settle(second.row.id, second.payment)])
  const rows = await Promise.all([orders.get(buyer.id, first.row.id), orders.get(other.id, second.row.id)])
  assert.deepEqual(rows.map(row => row.settlement.bonusPoints).sort(), ['0', '10'])
  assert.equal((await readRechargeStreak(source.manager, buyer.id, pkg.id)).consecutiveDays, 1)
  businessTime = null
})

test('连续状态迁移保留旧数据，空表up/down/up，无实体差异，非空拒绝down', async () => {
  const fixture = await new DataSource({ ...config, database: 'kuvibe_billing_test_migration', migrations: [] }).initialize()
  const runner = fixture.createQueryRunner()
  try {
    await runner.startTransaction()
    for (const file of (await readdir(new URL('../dist/src/migrations/', import.meta.url))).filter(file => file.endsWith('.js') && !file.includes('initData') && !file.includes('1790770200000')).sort()) {
      const module = await import(`../dist/src/migrations/${file}`)
      await new (Object.values(module).find(value => typeof value === 'function'))().up(runner)
    }
    const [buyer] = await runner.query(`INSERT INTO sys_user(username,name,password_hash,created_at) VALUES ('streak_legacy','旧用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z') RETURNING id`)
    const [pkg] = await runner.query(`INSERT INTO biz_recharge_package(code,status,current_revision) VALUES ('streak_legacy','disabled',1) RETURNING id`)
    const snapshot = async () => (await runner.query(`SELECT json_build_object('users',(SELECT json_agg(row_to_json(u)) FROM sys_user u),'packages',(SELECT json_agg(row_to_json(p)) FROM biz_recharge_package p)) AS value`))[0].value
    const original = await snapshot()
    const migration = new AddRechargePackageStreak1790770200000()
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
    await runner.query('INSERT INTO biz_recharge_package_streak(user_id,package_id,last_business_date,consecutive_days) VALUES ($1,$2,$3,1)', [buyer.id, pkg.id, '2026-09-30'])
    await assert.rejects(migration.down(runner), /已有业务数据/)
    assert.equal((await runner.query('SELECT count(*)::int AS n FROM biz_recharge_package_streak'))[0].n, 1)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await fixture.destroy()
  }
})
