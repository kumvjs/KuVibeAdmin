/* eslint-disable antfu/no-import-dist -- 使用构建产物在专用PostgreSQL验证真实并发与迁移。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { DataSource } from 'typeorm'
import { UpdateTable1789459958471 } from '../dist/src/migrations/1789459958471-update-table.js'
import { UpdateTable1789491815418 } from '../dist/src/migrations/1789491815418-update-table.js'
import { UpdateTable1789648814246 } from '../dist/src/migrations/1789648814246-update-table.js'
import { AddTenantId1790744400000 } from '../dist/src/migrations/1790744400000-add-tenant-id.js'
import { AddPointsLedger1790748558277 } from '../dist/src/migrations/1790748558277-add-points-ledger.js'
import { PointAccountEntity } from '../dist/src/modules/billing/points/entities/point-account.entity.js'
import { PointAllocationEntity } from '../dist/src/modules/billing/points/entities/point-allocation.entity.js'
import { PointLedgerEntity } from '../dist/src/modules/billing/points/entities/point-ledger.entity.js'
import { PointLotEntity } from '../dist/src/modules/billing/points/entities/point-lot.entity.js'
import { PointsService } from '../dist/src/modules/billing/points/points.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_test', '必须显式选择专用积分测试库')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST), '仅允许本机或本项目Docker服务')
const config = {
  type: 'postgres',
  host: process.env.TYPEORM_HOST,
  port: Number(process.env.TYPEORM_PORT),
  username: process.env.TYPEORM_USERNAME,
  password: process.env.TYPEORM_PASSWORD,
  database: process.env.POINTS_TEST_DATABASE,
  entities: ['dist/src/**/*.entity.js'],
  migrations: ['dist/src/migrations/*.js'],
  synchronize: false,
  migrationsRun: false,
  extra: { max: 16, options: '-c timezone=UTC' },
}
let source
let service
before(async () => {
  source = await new DataSource(config).initialize()
  await source.runMigrations()
  service = new PointsService(source)
})
after(async () => {
  if (source?.isInitialized)
    await source.destroy()
})

async function fixture() {
  const row = await source.getRepository(SysUserEntity).save({ username: `points_${randomUUID()}`, name: '积分测试用户', passwordHash: '$argon2id$fixture', tenantId: '1' })
  const command = (action, amount, extra = {}) => ({ userId: row.id, actorId: row.id, action, amount, businessType: 'integration', businessKey: randomUUID(), reason: '隔离测试', ...extra })
  return { row, command }
}

async function assertBalanced(userId) {
  const account = await service.account(userId)
  const [totals] = await source.query(`SELECT COALESCE(sum(available_delta),0)::text AS available, COALESCE(sum(frozen_delta),0)::text AS frozen, count(*)::text AS count FROM biz_point_ledger WHERE account_id=$1`, [account.accountId])
  assert.equal(totals.available, account.available)
  assert.equal(totals.frozen, account.frozen)
  assert.equal(totals.count, account.sequence)
  const [lots] = await source.query('SELECT COALESCE(sum(available),0)::text AS available, COALESCE(sum(frozen),0)::text AS frozen FROM biz_point_lot WHERE account_id=$1', [account.accountId])
  assert.equal(lots.available, account.available)
  assert.equal(lots.frozen, account.frozen)
}

test('200并发扣减余额100：只成功100次，余额与批次/流水一致', async () => {
  const { row, command } = await fixture()
  await service.execute(command('grant', '100'))
  const results = await Promise.allSettled(Array.from({ length: 200 }, () => service.execute(command('debit', '1'))))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 100)
  for (const result of results.filter(result => result.status === 'rejected'))
    assert.match(result.reason.message, /可用积分不足/)
  assert.equal((await service.account(row.id)).available, '0')
  await assertBalanced(row.id)
})

test('100并发同键只扣一次，同键不同内容冲突，游标稳定', async () => {
  const { row, command } = await fixture()
  await service.execute(command('grant', '100'))
  const debit = command('debit', '10')
  const results = await Promise.all(Array.from({ length: 100 }, () => service.execute(debit)))
  assert.equal(new Set(results.map(result => result.id)).size, 1)
  assert.equal((await service.account(row.id)).available, '90')
  await assert.rejects(service.execute({ ...debit, amount: '11' }), /幂等键/)
  const first = await service.ledger(row.id, undefined, 1)
  const second = await service.ledger(row.id, first.nextCursor, 1)
  assert.equal(first.items[0].action, 'debit')
  assert.equal(second.items[0].action, 'grant')
  assert.equal(second.nextCursor, null)
  await assertBalanced(row.id)
})

test('冻结凭证允许部分捕获/解冻，不超额、不串账户；赠分优先', async () => {
  const { row, command } = await fixture()
  const paid = await service.execute(command('grant', '70', { kind: 'paid' }))
  await service.execute(command('grant', '30', { kind: 'gift' }))
  const debit = await service.execute(command('debit', '20'))
  const allocation = await source.getRepository(PointAllocationEntity).findOneByOrFail({ ledgerId: debit.id })
  assert.equal((await source.getRepository(PointLotEntity).findOneByOrFail({ id: allocation.lotId })).kind, 'gift')
  const freeze = command('freeze', '50')
  const hold = await service.execute(freeze)
  assert.equal((await service.execute(freeze)).holdId, hold.holdId)
  await service.execute(command('capture', '20', { holdId: hold.holdId }))
  await service.execute(command('unfreeze', '30', { holdId: hold.holdId }))
  await assert.rejects(service.execute(command('capture', '1', { holdId: hold.holdId })), /冻结凭证/)
  const other = await fixture()
  await assert.rejects(service.execute(other.command('unfreeze', '1', { holdId: hold.holdId })), /冻结凭证/)
  await assert.rejects(service.execute(command('reverse', '70', { referenceId: paid.id })), /已消费或冻结/)
  await service.execute(command('reverse', '20', { referenceId: debit.id }))
  await assert.rejects(service.execute(command('reverse', '20', { referenceId: debit.id })), /已冲正/)
  assert.equal((await service.account(row.id)).available, '80')
  assert.equal((await service.account(row.id)).frozen, '0')
  await assertBalanced(row.id)
})

test('事务故障及流水写入故障不留下半笔扣减', async () => {
  const { row, command } = await fixture()
  await service.execute(command('grant', '30'))
  const beforeAccount = await service.account(row.id)
  await assert.rejects(source.transaction(async (manager) => {
    await service.executeInTransaction(manager, command('debit', '10'))
    throw new Error('模拟事务退出')
  }), /模拟事务退出/)
  assert.deepEqual(await service.account(row.id), beforeAccount)
  await source.query(`CREATE FUNCTION points_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='fixture_failure' THEN RAISE EXCEPTION '模拟流水写入失败'; END IF; RETURN NEW; END; $$`)
  await source.query('CREATE TRIGGER points_fixture_failure BEFORE INSERT ON biz_point_ledger FOR EACH ROW EXECUTE FUNCTION points_fixture_failure()')
  try {
    await assert.rejects(service.execute(command('debit', '10', { reason: 'fixture_failure' })), /模拟流水写入失败/)
    assert.deepEqual(await service.account(row.id), beforeAccount)
    await assertBalanced(row.id)
  }
  finally {
    await source.query('DROP TRIGGER points_fixture_failure ON biz_point_ledger')
    await source.query('DROP FUNCTION points_fixture_failure()')
  }
})

test('数据库阻止财务事实改删；软删除用户保留历史并拒绝常规增减', async () => {
  const { row, command } = await fixture()
  const ledger = await service.execute(command('grant', '9007199254740993'))
  assert.equal((await service.account(row.id)).available, '9007199254740993')
  await assert.rejects(source.query('UPDATE biz_point_ledger SET reason=$1 WHERE id=$2', ['篡改', ledger.id]), /不可修改/)
  await assert.rejects(source.query('DELETE FROM biz_point_allocation WHERE ledger_id=$1', [ledger.id]), /不可修改/)
  await assert.rejects(source.query('TRUNCATE biz_point_allocation'), /不可修改/)
  await source.getRepository(SysUserEntity).softDelete(row.id)
  await assert.rejects(service.execute(command('grant', '1')), /停用或删除/)
  assert.ok(await source.getRepository(PointLedgerEntity).existsBy({ id: ledger.id }))
  await assert.rejects(source.getRepository(SysUserEntity).delete(row.id), /foreign key/)
})

test('迁移保留旧数据，空新表可往返，有财务数据拒绝回滚，实体无残留diff', async () => {
  const migrationSource = await new DataSource({ ...config, database: 'kuvibe_billing_test_migration', migrations: [] }).initialize()
  const runner = migrationSource.createQueryRunner()
  try {
    await runner.startTransaction()
    await runner.query('SET LOCAL lock_timeout = \'3s\'')
    for (const migration of [new UpdateTable1789459958471(), new UpdateTable1789491815418(), new UpdateTable1789648814246(), new AddTenantId1790744400000()])
      await migration.up(runner)
    const [user] = await runner.query(`INSERT INTO sys_user(username,name,password_hash,created_at) VALUES ('points_migration','旧用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z') RETURNING *`)
    const snapshot = async () => (await runner.query('SELECT row_to_json(sys_user) AS value FROM sys_user ORDER BY id')).map(row => row.value)
    const before = await snapshot()
    const migration = new AddPointsLedger1790748558277()
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](runner)
      assert.deepEqual(await snapshot(), before)
    }
    const createRunner = migrationSource.createQueryRunner.bind(migrationSource)
    const release = runner.release.bind(runner)
    migrationSource.createQueryRunner = () => runner
    runner.release = async () => {}
    try {
      const diff = await migrationSource.driver.createSchemaBuilder().log()
      assert.deepEqual(diff.upQueries.map(query => query.query), [])
    }
    finally {
      migrationSource.createQueryRunner = createRunner
      runner.release = release
    }
    await runner.manager.getRepository(PointAccountEntity).insert({ userId: String(user.id), tenantId: '1' })
    await assert.rejects(migration.down(runner), /已有财务数据/)
    assert.equal((await runner.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'biz_point_%'`))[0].count, 6)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await migrationSource.destroy()
  }
})
