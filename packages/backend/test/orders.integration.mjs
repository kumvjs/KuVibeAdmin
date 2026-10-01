/* eslint-disable antfu/no-import-dist -- 真实PostgreSQL订单/额度/outbox和迁移验证。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { UpdateTable1789459958471 } from '../dist/src/migrations/1789459958471-update-table.js'
import { UpdateTable1789491815418 } from '../dist/src/migrations/1789491815418-update-table.js'
import { UpdateTable1789648814246 } from '../dist/src/migrations/1789648814246-update-table.js'
import { AddTenantId1790744400000 } from '../dist/src/migrations/1790744400000-add-tenant-id.js'
import { AddPointsLedger1790748558277 } from '../dist/src/migrations/1790748558277-add-points-ledger.js'
import { AddRechargeCatalog1790750149907 } from '../dist/src/migrations/1790750149907-add-recharge-catalog.js'
import { AddRechargeOrders1790751057378 } from '../dist/src/migrations/1790751057378-add-recharge-orders.js'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { BillingWorker } from '../dist/src/modules/billing/orders/billing.worker.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { billingTransaction } from '../dist/src/modules/billing/shared/billing-transaction.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
const config = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }
let source
let catalog
let orders
let outbox
let actor
const code = () => `test_${randomUUID().replaceAll('-', '')}`
async function user() {
  return source.getRepository(SysUserEntity).save({ username: code(), name: '订单测试用户', passwordHash: '$argon2id$fixture' })
}
async function pack(fields = {}) {
  const input = { code: code(), title: '订单测试套餐', priceMinor: '1000', basePoints: '1000', giftPoints: '100', ...fields }
  const row = await catalog.createPackage(input, actor.id)
  await catalog.publishPackage(row.id, 'enabled')
  return { row, input }
}
const command = row => ({ packageId: row.id, versionId: row.versionId, channel: 'wechat', client: 'qr', idempotencyKey: randomUUID(), payableMinor: row.priceMinor })
before(async () => {
  source = await new DataSource(config).initialize()
  await source.runMigrations()
  const quotas = new QuotaService()
  catalog = new CatalogService(source, quotas)
  outbox = new BillingOutboxService(source)
  orders = new OrdersService(source, catalog, quotas, outbox)
  actor = await user()
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('200不同用户抢20份每日限量：订单、预占和outbox严格一致', async () => {
  const { row } = await pack({ dailyLimit: '20' })
  const users = await source.getRepository(SysUserEntity).save(Array.from({ length: 200 }, () => ({ username: code(), name: '并发订单用户', passwordHash: '$argon2id$fixture' })))
  const results = await Promise.allSettled(users.map(item => orders.create(item.id, command(row))))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 20)
  for (const result of results.filter(result => result.status === 'rejected')) assert.match(result.reason.message, /已用完/)
  const [counts] = await source.query(`SELECT (SELECT count(*) FROM biz_recharge_order WHERE package_id=$1)::int AS orders,(SELECT count(*) FROM biz_order_reservation r JOIN biz_recharge_order o ON r.order_id=o.id WHERE o.package_id=$1)::int AS reservations,(SELECT count(*) FROM biz_billing_outbox b JOIN biz_recharge_order o ON b.aggregate_id=o.id WHERE o.package_id=$1 AND b.type='order_expire')::int AS jobs`, [row.id])
  assert.deepEqual(counts, { orders: 20, reservations: 80, jobs: 20 })
})

test('100次同键只建一次；并发不同键限制一笔现金订单；失败无残留', async () => {
  const buyer = await user()
  const { row } = await pack()
  const input = command(row)
  const results = await Promise.all(Array.from({ length: 100 }, () => orders.create(buyer.id, input)))
  assert.equal(new Set(results.map(result => result.id)).size, 1)
  await assert.rejects(orders.create(buyer.id, { ...input, payableMinor: '1001' }), /幂等键/)
  await assert.rejects(orders.create(buyer.id, { ...input, idempotencyKey: randomUUID() }), /未结束/)
  const other = await user()
  await assert.rejects(orders.get(other.id, results[0].id), /不存在/)
  const cancel = await Promise.all(Array.from({ length: 20 }, () => orders.cancel(buyer.id, results[0].id)))
  assert.ok(cancel.every(result => result.status === 'closed'))
  const [bucket] = await source.query('SELECT reserved::text,sold::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${row.id}:total`])
  assert.deepEqual(bucket, { reserved: '0', sold: '0' })
  await assert.rejects(orders.create(buyer.id, { ...command(row), payableMinor: '999' }), /金额已改变/)
  assert.equal((await source.query('SELECT id FROM biz_recharge_order WHERE user_id=$1', [buyer.id])).length, 1)
})

test('改版拒绝旧确认参数；原订单不可变，已发起支付取消不释放库存', async () => {
  const buyer = await user()
  const { row, input } = await pack()
  const order = await orders.create(buyer.id, command(row))
  await catalog.revisePackage(row.id, { ...input, basePoints: '2000', priceMinor: '2000' }, actor.id)
  assert.equal((await orders.get(buyer.id, order.id)).basePoints, '1000')
  await assert.rejects(orders.create((await user()).id, command(row)), /已改版/)
  await assert.rejects(source.query('UPDATE biz_recharge_order SET payable_minor=1 WHERE id=$1', [order.id]), /快照不可修改/)
  await assert.rejects(source.query('DELETE FROM biz_recharge_order WHERE id=$1', [order.id]), /不可删除/)
  await source.query('UPDATE biz_recharge_order SET payment_initiated=true WHERE id=$1', [order.id])
  await assert.rejects(source.query('UPDATE biz_recharge_order SET payment_initiated=false WHERE id=$1', [order.id]), /不可重置/)
  assert.equal((await orders.cancel(buyer.id, order.id)).status, 'closing')
  assert.equal((await source.query('SELECT reserved::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${row.id}:total`]))[0].reserved, '1')
  assert.equal((await source.query(`SELECT count(*)::int AS count FROM biz_billing_outbox WHERE type='order_close' AND aggregate_id=$1`, [order.id]))[0].count, 1)
})

test('内购无15分钟过期或站内库存，不允许站内取消', async () => {
  const buyer = await user()
  const { row } = await pack({ totalLimit: '0', dailyLimit: '0' })
  const product = await catalog.mapProduct({ versionId: row.versionId, channel: 'google', applicationId: 'test.app', environment: 'sandbox', productId: code() }, actor.id)
  const order = await orders.create(buyer.id, { ...command(row), channel: 'google', client: 'app', payableMinor: undefined, channelProductId: product.id })
  assert.equal(order.payableMinor, null)
  assert.equal(order.expiresAt, null)
  assert.equal((await source.query('SELECT id FROM biz_order_reservation WHERE order_id=$1', [order.id])).length, 0)
  await assert.rejects(orders.cancel(buyer.id, order.id), /内购不能/)
})

test('多实例SKIP LOCKED领取互斥，崩溃租约恢复，旧worker不能确认新租约', async () => {
  const type = code()
  await billingTransaction(source, async (manager) => {
    for (let index = 0; index < 50; index++) await outbox.enqueue(manager, type, '1', `job:${index}`)
  })
  const groups = await Promise.all(Array.from({ length: 10 }, () => outbox.claim([type], 5)))
  const leases = groups.flat()
  // SKIP LOCKED允许在其他领取语句仍持锁时少领，下一轮须能领取剩余任务。
  leases.push(...await outbox.claim([type], 100))
  assert.equal(leases.length, 50)
  assert.equal(new Set(leases.map(row => row.id)).size, 50)
  const crashed = leases[0]
  await source.query(`UPDATE biz_billing_outbox SET leased_until=NOW()-INTERVAL '1 second' WHERE id=$1`, [crashed.id])
  const [recovered] = await outbox.claim([type], 1)
  assert.equal(recovered.id, crashed.id)
  assert.notEqual(recovered.leaseToken, crashed.leaseToken)
  assert.equal(recovered.attempts, 2)
  assert.equal(await outbox.complete(crashed), false)
  assert.equal(await outbox.complete(recovered), true)
  assert.equal(await outbox.complete(recovered), false)
  await outbox.fail(leases[1], 'fixture_network_failure')
  assert.equal((await source.query('SELECT status FROM biz_billing_outbox WHERE id=$1', [leases[1].id]))[0].status, 'pending')
})

test('订单事务写入失败回滚额度/状态/outbox；审计与终态预占不可篡改', async () => {
  const buyer = await user()
  const { row } = await pack()
  await source.query(`CREATE FUNCTION order_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=${buyer.id} THEN RAISE EXCEPTION '模拟订单插入失败'; END IF; RETURN NEW; END; $$`)
  await source.query('CREATE TRIGGER order_fixture_failure BEFORE INSERT ON biz_recharge_order FOR EACH ROW EXECUTE FUNCTION order_fixture_failure()')
  try {
    await assert.rejects(orders.create(buyer.id, command(row)), /模拟订单插入失败/)
    assert.equal((await source.query('SELECT id FROM biz_quota_bucket WHERE resource_key=$1', [`package:${row.id}:total`])).length, 0)
    assert.equal((await source.query('SELECT id FROM biz_recharge_user_state WHERE user_id=$1', [buyer.id])).length, 0)
  }
  finally {
    await source.query('DROP TRIGGER order_fixture_failure ON biz_recharge_order')
    await source.query('DROP FUNCTION order_fixture_failure()')
  }
  const order = await orders.create(buyer.id, command(row))
  await orders.cancel(buyer.id, order.id)
  await assert.rejects(source.query(`UPDATE biz_order_reservation SET status='held' WHERE order_id=$1`, [order.id]), /重复释放/)
  await assert.rejects(source.query(`UPDATE biz_order_event SET reason='改写' WHERE order_id=$1`, [order.id]), /不可修改/)
})

test('停用用户超时补偿仍执行；已发起支付只能进入关单确认，库存保留', async () => {
  const buyer = await user()
  const initiatedBuyer = await user()
  const { row } = await pack()
  // 用隔离库插入触发器创建已经到期的真实订单，不改写已存在的不可变快照。
  await source.query(`CREATE FUNCTION order_fixture_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id IN (${buyer.id},${initiatedBuyer.id}) THEN NEW.expires_at=NOW()-INTERVAL '1 second'; END IF; RETURN NEW; END; $$`)
  await source.query('CREATE TRIGGER order_fixture_expiry BEFORE INSERT ON biz_recharge_order FOR EACH ROW EXECUTE FUNCTION order_fixture_expiry()')
  let order
  let initiatedOrder
  try {
    order = await orders.create(buyer.id, command(row))
    initiatedOrder = await orders.create(initiatedBuyer.id, command(row))
  }
  finally {
    await source.query('DROP TRIGGER order_fixture_expiry ON biz_recharge_order')
    await source.query('DROP FUNCTION order_fixture_expiry()')
  }
  await source.getRepository(SysUserEntity).softDelete(buyer.id)
  await source.query('UPDATE biz_recharge_order SET payment_initiated=true WHERE id=$1', [initiatedOrder.id])
  await source.query(`UPDATE biz_billing_outbox SET available_at=NOW() WHERE type='order_expire' AND aggregate_id=ANY($1)`, [[order.id, initiatedOrder.id]])
  // 专用测试库保留旧记录；只领取本阶段到期任务并排空积压，避免新支付任务占用批次。
  const expiryOutbox = {
    claim: () => outbox.claim(['order_expire'], 100),
    complete: lease => outbox.complete(lease),
    fail: (lease, reason) => outbox.fail(lease, reason),
  }
  const worker = new BillingWorker(expiryOutbox, orders, undefined)
  for (let attempt = 0; attempt < 20; attempt++) {
    await worker.tick()
    if ((await orders.get(buyer.id, order.id)).status === 'closed' && (await orders.get(initiatedBuyer.id, initiatedOrder.id)).status === 'closing')
      break
  }
  assert.equal((await orders.get(buyer.id, order.id)).status, 'closed')
  assert.equal((await orders.get(initiatedBuyer.id, initiatedOrder.id)).status, 'closing')
  assert.equal((await source.query('SELECT reserved::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${row.id}:total`]))[0].reserved, '1')
  assert.equal((await source.query(`SELECT status FROM biz_billing_outbox WHERE type='order_expire' AND aggregate_id=$1`, [order.id]))[0].status, 'done')
  assert.equal((await source.query(`SELECT status FROM biz_billing_outbox WHERE type='order_close' AND aggregate_id=$1`, [initiatedOrder.id]))[0].status, 'pending')
})

test('M3迁移保留既有用户与积分，空表往返、非空拒绝down、实体diff为空', async () => {
  const fixture = await new DataSource({ ...config, database: 'kuvibe_billing_test_migration', migrations: [], entities: ['dist/src/modules/{auth,user,upload}/**/*.entity.js', 'dist/src/modules/system/{dept,menu,role,sys-user,log}/**/*.entity.js', 'dist/src/modules/billing/{points,catalog,orders}/**/!(recharge-package-streak).entity.js'] }).initialize()
  const runner = fixture.createQueryRunner()
  try {
    await runner.startTransaction()
    for (const migration of [new UpdateTable1789459958471(), new UpdateTable1789491815418(), new UpdateTable1789648814246(), new AddTenantId1790744400000(), new AddPointsLedger1790748558277(), new AddRechargeCatalog1790750149907()]) await migration.up(runner)
    const [buyer] = await runner.query(`INSERT INTO sys_user(username,name,password_hash,created_at) VALUES ('order_old','旧用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z') RETURNING id`)
    await new PointsService(fixture).executeInTransaction(runner.manager, { userId: buyer.id, actorId: buyer.id, action: 'grant', amount: '42', kind: 'paid', businessType: 'fixture', businessKey: randomUUID(), reason: '旧账本迁移保留验证' })
    const snapshot = async () => (await runner.query(`SELECT json_build_object('users',(SELECT json_agg(row_to_json(u)) FROM sys_user u),'accounts',(SELECT json_agg(row_to_json(a)) FROM biz_point_account a),'ledger',(SELECT json_agg(row_to_json(l)) FROM biz_point_ledger l),'lots',(SELECT json_agg(row_to_json(p)) FROM biz_point_lot p),'allocations',(SELECT json_agg(row_to_json(b)) FROM biz_point_allocation b)) AS value`))[0].value
    const original = await snapshot()
    const migration = new AddRechargeOrders1790751057378()
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
    await runner.query(`INSERT INTO biz_billing_outbox(type,business_key,aggregate_id) VALUES ('fixture','guard',1)`)
    await assert.rejects(migration.down(runner), /已有业务数据/)
    assert.equal((await runner.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_name IN ('biz_recharge_order','biz_order_reservation','biz_order_event','biz_billing_outbox')`))[0].count, 4)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await fixture.destroy()
  }
})
