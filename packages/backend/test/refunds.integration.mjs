/* eslint-disable antfu/no-import-dist -- 退款领域使用真实PostgreSQL，渠道网络为明确契约替身。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { AddRefundReconciliation1790756580421 } from '../dist/src/migrations/1790756580421-add-refund-reconciliation.js'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { PaymentsService } from '../dist/src/modules/billing/payments/payments.service.js'
import { SettlementService } from '../dist/src/modules/billing/payments/settlement.service.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { ReconciliationService } from '../dist/src/modules/billing/refunds/reconciliation.service.js'
import { RefundsService } from '../dist/src/modules/billing/refunds/refunds.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test')
const config = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false, migrationsRun: false, extra: { max: 16, options: '-c timezone=UTC' } }
let source, catalog, orders, outbox, points, settlement, payments, refunds, reconciliation, actor
const code = () => `refund_${randomUUID().replaceAll('-', '')}`
const binding = { applicationId: 'wx1234567890abc', merchantId: '1234567890', environment: 'production' }
const provider = { binding: () => binding, refund: async () => {}, refundQuery: async () => {
  throw new Error('contract_unknown')
}, query: async () => {
  throw new Error('contract_unknown')
} }
const digest = () => createHash('sha256').update(code()).digest('hex')
const command = () => ({ idempotencyKey: randomUUID(), reason: '退款测试人工申请' })
const point = (buyer, action, amount, fields = {}) => points.execute({ userId: buyer.id, actorId: actor.id, action, amount, businessType: 'fixture', businessKey: randomUUID(), reason: '退款测试账务操作', ...fields })
async function user() {
  return source.getRepository(SysUserEntity).save({ username: code(), name: '退款测试用户', passwordHash: '$argon2id$fixture' })
}
async function paid(buyer = null) {
  buyer ??= await user()
  const pkg = await catalog.createPackage({ code: code(), title: '退款测试套餐', priceMinor: '1000', basePoints: '1000', giftPoints: '100', dailyLimit: '1' }, actor.id)
  await catalog.publishPackage(pkg.id, 'enabled')
  const order = await orders.create(buyer.id, { packageId: pkg.id, versionId: pkg.versionId, channel: 'wechat', client: 'qr', idempotencyKey: randomUUID(), payableMinor: '1000' })
  await payments.prepare(buyer.id, order.id)
  const proof = { channel: 'wechat', transactionKey: code(), merchantNo: order.merchantNo, ...binding, state: 'paid', amountMinor: '1000', currency: 'CNY', productId: null, bindingToken: null, quantity: '1', paidAt: new Date(), evidenceHash: digest() }
  await settlement.settle(order.id, proof)
  return { buyer, pkg, order, proof }
}
const refundProof = (fixture, refund, fields = {}) => ({ channel: 'wechat', merchantId: binding.merchantId, environment: binding.environment, merchantNo: fixture.order.merchantNo, transactionKey: fixture.proof.transactionKey, refundNo: refund.refundNo, refundKey: code(), originalMinor: '1000', refundMinor: '1000', currency: 'CNY', state: 'succeeded', evidenceHash: digest(), ...fields })
before(async () => {
  source = await new DataSource(config).initialize()
  await source.runMigrations()
  const quotas = new QuotaService()
  catalog = new CatalogService(source, quotas)
  orders = new OrdersService(source, catalog, quotas, outbox = new BillingOutboxService(source))
  points = new PointsService(source)
  refunds = new RefundsService(source, orders, points, outbox, provider, provider)
  settlement = new SettlementService(source, catalog, orders, quotas, points, outbox, refunds)
  payments = new PaymentsService(source, catalog, orders, outbox, settlement, provider, provider)
  reconciliation = new ReconciliationService(source, orders, outbox, payments, refunds)
  actor = await user()
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

test('100并发申请与100成功确认仅冻结/扣回一次，保留其他来源、首单与售出额度', async () => {
  const fixture = await paid()
  await point(fixture.buyer, 'grant', '500', { kind: 'gift' })
  const request = command()
  const rows = await Promise.all(Array.from({ length: 100 }, () => refunds.request(fixture.order.id, request, actor.id)))
  assert.equal(new Set(rows.map(row => row.id)).size, 1)
  assert.deepEqual({ available: (await points.account(fixture.buyer.id)).available, frozen: (await points.account(fixture.buyer.id)).frozen }, { available: '500', frozen: '1100' })
  await assert.rejects(point(fixture.buyer, 'unfreeze', '1', { holdId: rows[0].holdId }), /退款冻结凭证/)
  await assert.rejects(refunds.request(fixture.order.id, { ...request, reason: '不同参数' }, actor.id), /幂等键/)
  const proof = refundProof(fixture, rows[0])
  await Promise.all(Array.from({ length: 100 }, () => refunds.confirm(rows[0].id, proof)))
  assert.equal((await orders.get(fixture.buyer.id, fixture.order.id)).status, 'refunded')
  assert.equal((await points.account(fixture.buyer.id)).available, '500')
  assert.equal((await points.account(fixture.buyer.id)).frozen, '0')
  assert.equal((await source.query('SELECT first_order_id::text FROM biz_recharge_user_state WHERE user_id=$1', [fixture.buyer.id]))[0].first_order_id, fixture.order.id)
  assert.equal((await source.query('SELECT sold::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${fixture.pkg.id}:daily`]))[0].sold, '1')
  const [count] = await source.query(`SELECT COUNT(*)::int AS n FROM biz_point_ledger WHERE account_id=(SELECT id FROM biz_point_account WHERE user_id=$1) AND business_type='recharge_refund'`, [fixture.buyer.id])
  assert.equal(count.n, 2)
})

test('申请失败/未知/处理中保留冻结；错误金额不释放；仅验真CLOSED才解冻并可新申请', async () => {
  const fixture = await paid()
  const row = await refunds.request(fixture.order.id, command(), actor.id)
  await assert.rejects(refunds.process(row.id), /contract_unknown/)
  assert.equal((await points.account(fixture.buyer.id)).frozen, '1100')
  await refunds.confirm(row.id, refundProof(fixture, row, { state: 'processing' }))
  await assert.rejects(refunds.confirm(row.id, refundProof(fixture, row, { state: 'closed', refundMinor: '999' })), /不匹配/)
  assert.equal((await points.account(fixture.buyer.id)).frozen, '1100')
  await refunds.confirm(row.id, refundProof(fixture, row, { state: 'closed' }))
  assert.equal((await points.account(fixture.buyer.id)).available, '1100')
  assert.equal((await orders.get(fixture.buyer.id, fixture.order.id)).status, 'paid')
  const next = await refunds.request(fixture.order.id, command(), actor.id)
  assert.notEqual(next.refundNo, row.refundNo)
  await refunds.confirm(next.id, refundProof(fixture, next))
})

test('已消费或冻结原权益拒绝主动退款，充值发放禁止单独冲正', async () => {
  const fixture = await paid()
  const ledger = (await source.query('SELECT paid_ledger_id::text FROM biz_recharge_order WHERE id=$1', [fixture.order.id]))[0].paid_ledger_id
  await assert.rejects(point(fixture.buyer, 'reverse', '1000', { referenceId: ledger }), /原订单退款/)
  await point(fixture.buyer, 'debit', '1')
  await assert.rejects(refunds.request(fixture.order.id, command(), actor.id), /已消费或冻结/)
  assert.equal((await orders.get(fixture.buyer.id, fixture.order.id)).status, 'paid')
})

test('强制全额退款只恢复原批次可用/冻结，混合冻结保留其他来源，已消费缺口阻止消费与旧扣减冲正', async () => {
  const fixture = await paid()
  await point(fixture.buyer, 'grant', '500', { kind: 'gift' })
  const debit = await point(fixture.buyer, 'debit', '80')
  const hold = await point(fixture.buyer, 'freeze', '550')
  const proof = { ...fixture.proof, state: 'refunded', refundScope: 'full', evidenceHash: digest() }
  await Promise.all(Array.from({ length: 30 }, () => settlement.settle(fixture.order.id, proof)))
  const account = await points.account(fixture.buyer.id)
  assert.equal(account.available, '0')
  assert.equal(account.frozen, '500')
  assert.equal(account.status, 'blocked')
  const rows = await refunds.list(fixture.order.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sourcePoints, '1100')
  assert.equal(rows[0].recoveredPoints, '1020')
  assert.equal(rows[0].gapPoints, '80')
  await assert.rejects(point(fixture.buyer, 'debit', '1'), /冻结操作/)
  const [risk] = await refunds.risks(fixture.buyer.id)
  await refunds.resolveRisk(risk.id, '测试人工核销80积分缺口，确认无需追缴其他充值', actor.id)
  await assert.rejects(point(fixture.buyer, 'reverse', '80', { referenceId: debit.id }), /已退款/)
  await point(fixture.buyer, 'unfreeze', '500', { holdId: hold.holdId })
  assert.equal((await points.account(fixture.buyer.id)).available, '500')
})

test('部分/未知退款不扣全部积分，保留paid并创建人工风险；处理中转外部全退不重复扣回', async () => {
  const fixture = await paid()
  await settlement.settle(fixture.order.id, { ...fixture.proof, state: 'refunded', refundScope: 'partial', evidenceHash: digest() })
  assert.equal((await points.account(fixture.buyer.id)).available, '1100')
  assert.equal((await points.account(fixture.buyer.id)).status, 'blocked')
  assert.equal((await orders.get(fixture.buyer.id, fixture.order.id)).status, 'paid')
  await assert.rejects(refunds.request(fixture.order.id, command(), actor.id), /须先人工复核/)
  const active = await paid()
  const row = await refunds.request(active.order.id, command(), actor.id)
  await settlement.settle(active.order.id, { ...active.proof, state: 'refunded', refundScope: 'full', evidenceHash: digest() })
  await refunds.confirm(row.id, refundProof(active, row))
  assert.equal((await points.account(active.buyer.id)).available, '0')
  assert.equal((await points.account(active.buyer.id)).frozen, '0')
  assert.equal((await refunds.list(active.order.id)).length, 1)
})

test('中途失败退款整体回滚；原凭据可重试且不产生虚假扣回', async () => {
  const fixture = await paid()
  const row = await refunds.request(fixture.order.id, command(), actor.id)
  await source.query(`CREATE FUNCTION refund_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=${fixture.order.id} AND NEW.status='refunded' THEN RAISE EXCEPTION 'refund_fixture_failure'; END IF; RETURN NEW; END; $$`)
  await source.query('CREATE TRIGGER refund_fixture_failure BEFORE UPDATE ON biz_recharge_order FOR EACH ROW EXECUTE FUNCTION refund_fixture_failure()')
  try {
    await assert.rejects(refunds.confirm(row.id, refundProof(fixture, row)), /refund_fixture_failure/)
  }
  finally {
    await source.query('DROP TRIGGER refund_fixture_failure ON biz_recharge_order')
    await source.query('DROP FUNCTION refund_fixture_failure()')
  }
  assert.equal((await points.account(fixture.buyer.id)).frozen, '1100')
  assert.equal((await refunds.list(fixture.order.id))[0].recoveredPoints, '0')
  await refunds.confirm(row.id, refundProof(fixture, row))
  assert.equal((await points.account(fixture.buyer.id)).frozen, '0')
})

test('幂等对账核对账本、批次、冻结、订单、额度；明确未查渠道；差异不改余额并限制消费', async () => {
  const fixture = await paid()
  const input = { ...command(), verifyChannel: false }
  const jobs = await Promise.all(Array.from({ length: 20 }, () => reconciliation.request(fixture.order.id, input, actor.id)))
  assert.equal(new Set(jobs.map(job => job.id)).size, 1)
  await reconciliation.process(jobs[0].id)
  const [result] = await reconciliation.list(fixture.order.id)
  assert.equal(result.status, 'done')
  assert.deepEqual(result.findings, [{ code: 'channel_not_checked' }])
  await source.query(`UPDATE biz_point_account SET available=available+1 WHERE user_id=$1`, [fixture.buyer.id])
  const job = await reconciliation.request(fixture.order.id, { ...command(), verifyChannel: false }, actor.id)
  await reconciliation.process(job.id)
  const [bad] = await reconciliation.list(fixture.order.id)
  assert.equal(bad.status, 'review')
  assert.ok(bad.findings.some(item => item.code === 'account_ledger_available'))
  assert.equal((await points.account(fixture.buyer.id)).available, '1101')
  assert.equal((await points.account(fixture.buyer.id)).status, 'blocked')
  const repairCommand = { ...command(), verifyChannel: false, repairProjection: true }
  const repair = await reconciliation.request(fixture.order.id, repairCommand, actor.id)
  await reconciliation.process(repair.id, true)
  await reconciliation.process(repair.id, true)
  assert.equal((await points.account(fixture.buyer.id)).available, '1100')
  assert.equal((await points.account(fixture.buyer.id)).status, 'blocked', '修复不能擅自解除已有风险')
  const [fixed] = await reconciliation.list(fixture.order.id)
  assert.equal(fixed.status, 'done')
  assert.ok(fixed.findings.some(item => item.code === 'projection_rebuilt'))
  await assert.rejects(reconciliation.request(fixture.order.id, { ...repairCommand, repairProjection: false }, actor.id), /幂等键/)
})

test('M5迁移保留历史已付订单/首单/积分，空表往返、非空拒绝down、实体diff为空、审计防篡改', async () => {
  const fixture = await new DataSource({ ...config, database: 'kuvibe_billing_test_migration', migrations: [], entities: ['dist/src/modules/{auth,user,upload}/**/*.entity.js', 'dist/src/modules/system/{dept,menu,role,sys-user,log}/**/*.entity.js', 'dist/src/modules/billing/**/!(recharge-package-streak).entity.js'] }).initialize()
  const runner = fixture.createQueryRunner()
  try {
    await runner.startTransaction()
    for (const file of ['1789459958471-update-table', '1789491815418-update-table', '1789648814246-update-table', '1790744400000-add-tenant-id', '1790748558277-add-points-ledger', '1790750149907-add-recharge-catalog', '1790751057378-add-recharge-orders', '1790753142319-add-payment-processing']) {
      const module = await import(`../dist/src/migrations/${file}.js`)
      await new (Object.values(module).find(value => typeof value === 'function'))().up(runner)
    }
    const [buyer] = await runner.query(`INSERT INTO sys_user(username,name,password_hash,created_at) VALUES ('refund_old','旧用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z') RETURNING id`)
    const grant = await new PointsService(fixture).executeInTransaction(runner.manager, { userId: buyer.id, actorId: buyer.id, action: 'grant', amount: '42', kind: 'paid', businessType: 'recharge', businessKey: randomUUID(), reason: '旧充值迁移保留验证' })
    const [pkg] = await runner.query(`INSERT INTO biz_recharge_package(code,status,current_revision) VALUES ('refund_old','disabled',1) RETURNING id`)
    const [order] = await runner.query(`INSERT INTO biz_recharge_order(user_id,package_id,merchant_no,idempotency_key,request_hash,channel,client,business_date,payable_minor,snapshot,expires_at) VALUES ($1,$2,'refund_old','old_key','old_hash','wechat','qr','2020-01-01',100,'{}','2020-01-01T00:15:00.123456Z') RETURNING id`, [buyer.id, pkg.id])
    await runner.query(`INSERT INTO biz_payment_transaction(order_id,channel,transaction_key,facts,bonus_points) VALUES ($1,'wechat','old_tx','{}',0)`, [order.id])
    await runner.query(`UPDATE biz_recharge_order SET status='paid',paid_ledger_id=$2,settled_at='2020-01-01T00:00:00.123456Z' WHERE id=$1`, [order.id, grant.id])
    await runner.query(`INSERT INTO biz_recharge_user_state(user_id,first_order_id,settlement_sequence) VALUES ($1,$2,1)`, [buyer.id, order.id])
    const snapshot = async () => (await runner.query(`SELECT json_build_object('users',(SELECT json_agg(row_to_json(u)) FROM sys_user u),'accounts',(SELECT json_agg(row_to_json(a)) FROM biz_point_account a),'ledger',(SELECT json_agg(row_to_json(l)) FROM biz_point_ledger l),'orders',(SELECT json_agg(row_to_json(o)) FROM biz_recharge_order o),'first',(SELECT json_agg(row_to_json(s)) FROM biz_recharge_user_state s)) AS value`))[0].value
    const original = await snapshot()
    const migration = new AddRefundReconciliation1790756580421()
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](runner)
      assert.deepEqual(await snapshot(), original)
    }
    const extension = await import('../dist/src/migrations/1790992800000-decouple-iap-payment-records.js')
    await new extension.DecoupleIapPaymentRecords1790992800000().up(runner)
    assert.deepEqual(await snapshot(), original)
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
    await runner.query(`INSERT INTO biz_billing_reconciliation(order_id,request_key,request_hash,actor_id,reason) VALUES ($1,'fixture','hash',$2,'旧数据防篡改验证')`, [order.id, buyer.id])
    await runner.query('SAVEPOINT mutation_test')
    await assert.rejects(runner.query('UPDATE biz_point_lot SET initial=initial+1'), /不可修改/)
    await runner.query('ROLLBACK TO SAVEPOINT mutation_test')
    await assert.rejects(migration.down(runner), /已有业务数据/)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await fixture.destroy()
  }
})

test('渠道查证失败不会标记对账完成；仅恢复本订单死信，有效租约不被抢占；同交易查证不再次发分', async () => {
  const fixture = await paid()
  await source.query(`UPDATE biz_billing_outbox SET status='dead',attempts=10 WHERE type='payment_poll' AND aggregate_id=$1`, [fixture.order.id])
  const leaseToken = randomUUID()
  await source.query(`UPDATE biz_billing_outbox SET status='processing',lease_token=$2,leased_until=NOW()+INTERVAL '5 minutes' WHERE type='payment_prepare' AND aggregate_id=$1`, [fixture.order.id, leaseToken])
  const job = await reconciliation.request(fixture.order.id, command(), actor.id)
  const rows = await source.query(`SELECT type,status,lease_token FROM biz_billing_outbox WHERE aggregate_id=$1 AND type IN ('payment_prepare','payment_poll')`, [fixture.order.id])
  assert.equal(rows.find(row => row.type === 'payment_prepare').lease_token, leaseToken)
  assert.equal(rows.find(row => row.type === 'payment_poll').status, 'pending')
  await assert.rejects(reconciliation.process(job.id), /contract_unknown/)
  assert.equal((await reconciliation.list(fixture.order.id))[0].status, 'pending')
  const original = provider.query
  provider.query = async () => fixture.proof
  try {
    await reconciliation.process(job.id)
  }
  finally { provider.query = original }
  assert.equal((await reconciliation.list(fixture.order.id))[0].status, 'done')
  assert.equal((await points.account(fixture.buyer.id)).available, '1100')
})

test('批次分配证据不一致时拒绝投影修复，不伪造流水或增加余额', async () => {
  const fixture = await paid()
  const [lot] = await source.query(`SELECT l.id::text FROM biz_point_lot l JOIN biz_recharge_order o ON l.grant_id=o.paid_ledger_id WHERE o.id=$1`, [fixture.order.id])
  await source.query('UPDATE biz_point_lot SET available=available-1 WHERE id=$1', [lot.id])
  try {
    const job = await reconciliation.request(fixture.order.id, { ...command(), verifyChannel: false, repairProjection: true }, actor.id)
    await reconciliation.process(job.id, true)
    const [result] = await reconciliation.list(fixture.order.id)
    assert.equal(result.status, 'review')
    assert.ok(result.findings.some(item => item.code === 'lot_allocation_replay'))
    assert.ok(!result.findings.some(item => item.code === 'projection_rebuilt'))
    assert.equal((await points.account(fixture.buyer.id)).available, '1100')
  }
  finally {
    // 仅恢复本测试故障注入的来源投影；产品修复不允许无凭据修改批次。
    await source.query('UPDATE biz_point_lot SET available=available+1 WHERE id=$1', [lot.id])
  }
})
