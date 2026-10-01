/* eslint-disable antfu/no-import-dist -- 用构建产物验证真实PostgreSQL并发和迁移。 */
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
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { billingTransaction } from '../dist/src/modules/billing/shared/billing-transaction.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
const config = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }
let source
let catalog
let quotas
let user
const packageInput = fields => ({ title: '隔离测试套餐', priceMinor: '1000', basePoints: '1000', giftPoints: '100', totalLimit: null, dailyLimit: null, userTotalLimit: null, userDailyLimit: null, ...fields })
const promotionInput = fields => ({ title: '隔离测试活动', effect: 'bonus_fixed', value: '10', eligibility: 'always', channels: ['wechat'], packageIds: [], minimumMinor: '0', requiresCoupon: false, priority: 0, startsAt: '2020-01-01T00:00:00Z', endsAt: '2040-01-01T00:00:00Z', totalUses: null, userTotalUses: null, userDailyUses: null, cashBudget: null, pointsBudget: null, ...fields })
const code = () => `test_${randomUUID().replaceAll('-', '')}`
async function createPackage(fields = {}) {
  const row = await catalog.createPackage({ code: code(), ...packageInput(fields) }, user.id)
  await catalog.publishPackage(row.id, 'enabled')
  return row
}
before(async () => {
  source = await new DataSource(config).initialize()
  await source.runMigrations()
  quotas = new QuotaService()
  catalog = new CatalogService(source, quotas)
  user = await source.getRepository(SysUserEntity).save({ username: code(), name: '套餐测试用户', passwordHash: '$argon2id$fixture' })
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('200并发抢每日限量20，只预占20份；多资源失败整笔回滚', async () => {
  const pack = await createPackage({ dailyLimit: '20' })
  const demand = { resourceKey: `package:${pack.id}:daily`, periodKey: '2026-09-30', limit: '20', amount: '1' }
  const results = await Promise.allSettled(Array.from({ length: 200 }, () => billingTransaction(source, async (manager) => {
    await catalog.lockPackage(manager, pack.id, 'pessimistic_read')
    return quotas.reserve(manager, [demand])
  })))
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 20)
  for (const row of results.filter(row => row.status === 'rejected')) assert.match(row.reason.message, /已用完/)
  assert.equal((await source.query('SELECT reserved::text FROM biz_quota_bucket WHERE resource_key=$1', [demand.resourceKey]))[0].reserved, '20')
  const spare = { ...demand, resourceKey: `package:${pack.id}:cash`, limit: '100' }
  await assert.rejects(billingTransaction(source, manager => quotas.reserve(manager, [spare, demand])), /已用完/)
  assert.equal((await source.query('SELECT id FROM biz_quota_bucket WHERE resource_key=$1', [spare.resourceKey])).length, 0)
})

test('预算消费/释放保留总量，新版本不得低于已售和预占额度', async () => {
  const pack = await createPackage({ totalLimit: '5' })
  const demand = { resourceKey: `package:${pack.id}:total`, periodKey: 'lifetime', limit: '5', amount: '3' }
  const reserved = await billingTransaction(source, manager => quotas.reserve(manager, [demand]))
  await billingTransaction(source, manager => quotas.finish(manager, reserved, 'consume'))
  const more = await billingTransaction(source, manager => quotas.reserve(manager, [{ ...demand, amount: '2' }]))
  await assert.rejects(catalog.revisePackage(pack.id, packageInput({ totalLimit: '4' }), user.id), /新限额/)
  await billingTransaction(source, manager => quotas.finish(manager, more, 'release'))
  const revised = await catalog.revisePackage(pack.id, packageInput({ totalLimit: '3', priceMinor: '1200' }), user.id)
  assert.equal(revised.revision, 2)
  const [bucket] = await source.query('SELECT reserved::text,sold::text FROM biz_quota_bucket WHERE resource_key=$1', [demand.resourceKey])
  assert.deepEqual(bucket, { reserved: '0', sold: '3' })
  await assert.rejects(billingTransaction(source, manager => quotas.reserve(manager, [{ ...demand, limit: '3', amount: '1' }])), /已用完/)
  await assert.rejects(source.query('UPDATE biz_package_version SET price_minor=999 WHERE id=$1', [pack.versionId]), /不可修改/)
})

test('已发券固定活动版本，改优惠不改已发权益；绑定用户和内购渠道受控', async () => {
  const pack = await createPackage()
  const promo = await catalog.createPromotion({ code: code(), ...promotionInput({ effect: 'fixed_discount', value: '100', requiresCoupon: true, packageIds: [pack.id] }) }, user.id)
  await catalog.publishPromotion(promo.id, 'enabled')
  const couponCode = code()
  const coupon = await catalog.createCoupon({ code: couponCode, promotionId: promo.id, userId: user.id, totalLimit: '1', startsAt: '2021-01-01T00:00:00Z', endsAt: '2039-01-01T00:00:00Z' }, user.id)
  await catalog.revisePromotion(promo.id, promotionInput({ effect: 'fixed_discount', value: '200', requiresCoupon: true, packageIds: [pack.id] }), user.id)
  const quote = await catalog.quote(pack.id, { channel: 'wechat', couponCode }, user.id)
  assert.equal(quote.payableMinor, '900')
  assert.equal(quote.cashPromotionId, promo.id)
  await assert.rejects(catalog.quote(pack.id, { channel: 'wechat', couponCode }, '999999999999'), /不属于本人/)
  await assert.rejects(source.query('DELETE FROM biz_coupon WHERE id=$1', [coupon.id]), /不可修改/)
  await assert.rejects(source.query('TRUNCATE biz_channel_product'), /不可修改/)
})

test('内购固定SKU权益，价格由商店决定；首单事实不能重置', async () => {
  const pack = await createPackage()
  const promo = await catalog.createPromotion({ code: code(), ...promotionInput({ channels: ['apple', 'google'], eligibility: 'first_user', value: '500', packageIds: [pack.id] }) }, user.id)
  await catalog.publishPromotion(promo.id, 'enabled')
  const product = await catalog.mapProduct({ versionId: pack.versionId, channel: 'apple', applicationId: 'test.app', environment: 'sandbox', productId: code() }, user.id)
  const quote = await catalog.quote(pack.id, { channel: 'apple', channelProductId: product.id }, user.id)
  assert.equal(quote.payableMinor, null)
  assert.equal(quote.guaranteedBonusPoints, '0')
  assert.equal(quote.estimatedBonusPoints, '500')
  await assert.rejects(catalog.mapProduct({ ...product, versionId: pack.versionId }, user.id), /已存在/)
  await source.query('INSERT INTO biz_recharge_user_state(user_id,first_order_id) VALUES ($1,123)', [user.id])
  await assert.rejects(source.query('UPDATE biz_recharge_user_state SET first_order_id=NULL WHERE user_id=$1', [user.id]), /不可重置/)
  assert.equal((await catalog.quote(pack.id, { channel: 'apple', channelProductId: product.id }, user.id)).estimatedBonusPoints, '0')
  await catalog.revisePackage(pack.id, packageInput({ basePoints: '2000' }), user.id)
  await assert.rejects(catalog.quote(pack.id, { channel: 'apple', channelProductId: product.id }, user.id), /当前版本/)
  assert.equal((await source.query('SELECT base_points::text FROM biz_package_version WHERE id=$1', [product.versionId]))[0].base_points, '1000')
})

test('M2迁移旧数据不变，空表往返，有数据拒绝回滚，实体diff为空', async () => {
  const fixture = await new DataSource({ ...config, database: 'kuvibe_billing_test_migration', entities: ['dist/src/modules/{auth,user,upload}/**/*.entity.js', 'dist/src/modules/system/{dept,menu,role,sys-user,log}/**/*.entity.js', 'dist/src/modules/billing/{points,catalog}/**/!(recharge-package-streak).entity.js'], migrations: [] }).initialize()
  const runner = fixture.createQueryRunner()
  try {
    await runner.startTransaction()
    for (const migration of [new UpdateTable1789459958471(), new UpdateTable1789491815418(), new UpdateTable1789648814246(), new AddTenantId1790744400000(), new AddPointsLedger1790748558277()]) await migration.up(runner)
    await runner.query(`INSERT INTO sys_user(username,name,password_hash,created_at) VALUES ('catalog_old','旧用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z')`)
    const snapshot = async () => (await runner.query('SELECT row_to_json(sys_user) AS value FROM sys_user ORDER BY id')).map(row => row.value)
    const original = await snapshot()
    const migration = new AddRechargeCatalog1790750149907()
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](runner)
      assert.deepEqual(await snapshot(), original)
    }
    const originalCreate = fixture.createQueryRunner.bind(fixture)
    const originalRelease = runner.release.bind(runner)
    fixture.createQueryRunner = () => runner
    runner.release = async () => {}
    try {
      assert.deepEqual((await fixture.driver.createSchemaBuilder().log()).upQueries.map(row => row.query), [])
    }
    finally {
      fixture.createQueryRunner = originalCreate
      runner.release = originalRelease
    }
    await runner.query(`INSERT INTO biz_recharge_package(code) VALUES ('rollback_guard')`)
    await assert.rejects(migration.down(runner), /已有业务数据/)
    assert.equal((await runner.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_name IN ('biz_recharge_package','biz_package_version','biz_channel_product','biz_promotion','biz_promotion_version','biz_coupon','biz_quota_bucket','biz_recharge_user_state','biz_recharge_user_day')`))[0].count, 9)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await fixture.destroy()
  }
})
