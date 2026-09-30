/* eslint-disable antfu/no-import-dist -- 两个Docker API与独立worker的真实HTTP并发验证，仅允许专用测试库。 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { SysRoleEntity } from '../dist/src/modules/system/role/entities/role.entity.js'
import SysUserRoleEntity from '../dist/src/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import { initializeBaseData } from '../dist/src/scripts/setup-data.js'
import 'reflect-metadata'

test('两个真实HTTP API与独立worker的账务并发一致性', async () => {
  assert.equal(process.env.POINTS_TEST_DATABASE, 'kuvibe_billing_scale')
  assert.ok(['127.0.0.1', 'localhost'].includes(process.env.TYPEORM_HOST))
  const bases = ['http://127.0.0.1:17002/api', 'http://127.0.0.1:17003/api']
  const source = await new DataSource({ type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, database: process.env.POINTS_TEST_DATABASE, entities: ['dist/src/**/*.entity.js'], synchronize: false, extra: { max: 16 } }).initialize()
  const marker = `scale_${randomUUID().replaceAll('-', '')}`
  const password = randomBytes(24).toString('base64url')
  const metrics = []
  async function request(index, path, body, token) {
    const start = performance.now()
    const response = await fetch(`${bases[index % 2]}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) })
    const data = await response.json()
    return { status: response.status, data: data.data, success: data.success, milliseconds: performance.now() - start }
  }
  async function measure(name, count, operation) {
    const start = performance.now()
    const rows = await Promise.all(Array.from({ length: count }, (_, index) => operation(index)))
    const seconds = (performance.now() - start) / 1000
    const times = rows.map(row => row.milliseconds).sort((a, b) => a - b)
    const statuses = {}
    for (const row of rows) statuses[row.status] = (statuses[row.status] ?? 0) + 1
    metrics.push({ name, requests: count, seconds: +seconds.toFixed(3), successfulResponseTPS: +(rows.filter(row => row.status === 200 && row.success).length / seconds).toFixed(2), uniqueMutationIds: new Set(rows.filter(row => row.status === 200 && row.success && row.data?.id).map(row => row.data.id)).size, p95ms: +times[Math.ceil(count * 0.95) - 1].toFixed(2), p99ms: +times[Math.ceil(count * 0.99) - 1].toFixed(2), statuses })
    return rows
  }
  try {
    await initializeBaseData(source)
    const roles = source.getRepository(SysRoleEntity)
    const superRole = await roles.findOneBy({ code: 'super' }) ?? await roles.save({ code: 'super', name: '测试超级管理员', status: 1, isDefault: false })
    const users = source.getRepository(SysUserEntity)
    const admin = users.create({ username: `${marker}_admin`, name: '多实例验收管理员', status: 1, sessionVersion: 1 })
    await admin.setPassword(password)
    await users.save(admin)
    await source.getRepository(SysUserRoleEntity).save({ userId: admin.id, roleId: superRole.id })
    const buyers = await users.save(Array.from({ length: 202 }, (_, index) => users.create({ username: `${marker}_${index}`, name: '多实例验收用户', passwordHash: admin.passwordHash, status: 1, sessionVersion: 1 })))
    const login = await request(0, '/auth/login', { username: admin.username, password })
    assert.equal(login.success, true, '真实HTTP管理员登录失败')
    const token = login.data.accessToken
    const tokens = []
    // 登录限并发，避免把Argon2校验开销混入业务压测。
    for (let start = 0; start < buyers.length; start += 5) {
      tokens.push(...await Promise.all(buyers.slice(start, start + 5).map(async (buyer, index) => {
        const login = await request(index, '/auth/login', { username: buyer.username, password })
        assert.equal(login.success, true, '真实HTTP用户登录失败')
        return login.data.accessToken
      })))
    }
    const createPackage = async (suffix, dailyLimit) => {
      const created = await request(0, '/system/billing/packages', { code: `${marker}_${suffix}`, title: '多实例HTTP验收', priceMinor: '100', basePoints: '100', giftPoints: '10', dailyLimit }, token)
      assert.equal(created.success, true)
      assert.equal((await request(1, `/system/billing/packages/${created.data.id}/status`, { status: 'enabled' }, token)).success, true)
      return created.data
    }
    const pack = await createPackage('stock', '10')
    const input = { packageId: pack.id, versionId: pack.versionId, channel: 'wechat', client: 'qr', payableMinor: '100' }
    const stock = await measure('200用户经两个API抢每日10份', 200, index => request(index, '/recharge/orders', { ...input, idempotencyKey: randomUUID() }, tokens[index]))
    assert.equal(stock.filter(row => row.status === 200 && row.success).length, 10)
    assert.ok(stock.every(row => [200, 409, 503].includes(row.status)))
    const quota = (await source.query('SELECT reserved::text,sold::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${pack.id}:daily`]))[0]
    assert.deepEqual(quota, { reserved: '10', sold: '0' })
    const unlimited = await createPackage('replay', null)
    const sameOrder = { ...input, packageId: unlimited.id, versionId: unlimited.versionId, idempotencyKey: randomUUID() }
    const replay = await measure('100跨API同键下单', 100, index => request(index, '/recharge/orders', sameOrder, tokens[200]))
    assert.ok(replay.every(row => row.status === 200 && row.success))
    assert.equal(new Set(replay.map(row => row.data.id)).size, 1)
    const target = buyers[201]
    assert.equal((await request(0, `/system/points/${target.id}/grant`, { amount: '100', kind: 'paid', idempotencyKey: randomUUID(), reason: '多实例扣减验收' }, token)).success, true)
    const debits = await measure('200跨API扣减同账户100积分', 200, index => request(index, `/system/points/${target.id}/debit`, { amount: '1', idempotencyKey: randomUUID(), reason: '多实例扣减验收' }, token))
    assert.equal(debits.filter(row => row.status === 200 && row.success).length, 100)
    assert.ok(debits.every(row => [200, 409, 503].includes(row.status)))
    assert.equal((await request(0, '/points/account', undefined, tokens[201])).data.available, '0')
    const sameGrant = { amount: '3', kind: 'gift', idempotencyKey: randomUUID(), reason: '多实例相同幂等键验收' }
    const grants = await measure('100跨API同键增加积分', 100, index => request(index, `/system/points/${target.id}/grant`, sameGrant, token))
    assert.ok(grants.every(row => row.status === 200 && row.success))
    assert.equal(new Set(grants.map(row => row.data.id)).size, 1)
    assert.equal((await request(1, '/points/account', undefined, tokens[201])).data.available, '3')
    const reads = await measure('200跨API读取积分与流水', 200, index => request(index, index % 2 ? '/points/ledger' : '/points/account', undefined, tokens[201]))
    assert.ok(reads.every(row => row.status === 200 && row.success))
    const unauthorized = await request(0, '/system/billing/orders/1/refund', { idempotencyKey: randomUUID(), reason: '普通角色不得退款' }, tokens[201])
    assert.equal(unauthorized.status, 403)
    assert.equal((await request(0, `/recharge/orders/${replay[0].data.id}/payment`, {}, tokens[200])).status, 503)
    const swagger = await (await fetch('http://127.0.0.1:17002/api-docs/json')).json()
    for (const path of ['/system/billing/orders/{id}/refund', '/system/billing/orders/{id}/reconcile', '/system/billing/risks/{id}/resolve']) assert.ok(swagger.paths[path])
    // Worker实际处理隔离的即期订单；触发器仅改变本测试套餐的插入时间，不修改已存在快照。
    const expiry = await createPackage('expiry', '1')
    await source.query(`CREATE FUNCTION scale_fixture_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.package_id=${expiry.id} THEN NEW.expires_at=NOW()-INTERVAL '1 second'; END IF; RETURN NEW; END; $$`)
    await source.query('CREATE TRIGGER scale_fixture_expiry BEFORE INSERT ON biz_recharge_order FOR EACH ROW EXECUTE FUNCTION scale_fixture_expiry()')
    let expiryOrder
    try {
      expiryOrder = await request(1, '/recharge/orders', { ...input, packageId: expiry.id, versionId: expiry.versionId, idempotencyKey: randomUUID() }, tokens[201])
      assert.equal(expiryOrder.success, true)
    }
    finally {
      await source.query('DROP TRIGGER scale_fixture_expiry ON biz_recharge_order')
      await source.query('DROP FUNCTION scale_fixture_expiry()')
    }
    await source.query(`UPDATE biz_billing_outbox SET available_at=NOW() WHERE type='order_expire' AND aggregate_id=$1`, [expiryOrder.data.id])
    const deadline = Date.now() + 30000
    let expired
    do {
      expired = (await request(0, `/recharge/orders/${expiryOrder.data.id}`, undefined, tokens[201])).data
      if (expired.status === 'closed')
        break
      await new Promise(resolve => setTimeout(resolve, 1000))
    } while (Date.now() < deadline)
    assert.equal(expired.status, 'closed', '独立worker须在30秒内完成到期释放')
    assert.equal((await source.query('SELECT reserved::text FROM biz_quota_bucket WHERE resource_key=$1', [`package:${expiry.id}:daily`]))[0].reserved, '0')
    console.log(JSON.stringify({ database: 'kuvibe_billing_scale', apiInstances: 2, workers: 1, correctnessViolations: 0, metrics }, null, 2))
    // 只关闭本次测试订单和套餐；保留账务、用户与审计记录供核验。
    for (const row of stock.filter(row => row.status === 200)) await request(0, `/recharge/orders/${row.data.id}/cancel`, {}, tokens[buyers.findIndex(buyer => buyer.id === row.data.userId)])
    await request(0, `/recharge/orders/${replay[0].data.id}/cancel`, {}, tokens[200])
    for (const row of [pack, unlimited, expiry]) await request(0, `/system/billing/packages/${row.id}/status`, { status: 'disabled' }, token)
  }
  finally {
    await source.destroy()
  }
})
