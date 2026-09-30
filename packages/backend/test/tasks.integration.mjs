/* eslint-disable antfu/no-top-level-await, antfu/no-import-dist -- 真实隔离 PostgreSQL、RabbitMQ 与 HTTP 验收。 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { connect } from 'amqplib'
import { parse } from 'dotenv'
import { DataSource } from 'typeorm'
import { AddTaskScheduling1790800000000 } from '../dist/src/migrations/1790800000000-add-task-scheduling.js'
import { CatalogService } from '../dist/src/modules/billing/catalog/catalog.service.js'
import { QuotaService } from '../dist/src/modules/billing/catalog/quota.service.js'
import { BillingWorker } from '../dist/src/modules/billing/orders/billing.worker.js'
import { OrdersService } from '../dist/src/modules/billing/orders/orders.service.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { ChannelPendingError } from '../dist/src/modules/billing/payments/payment.types.js'
import { SysRoleEntity } from '../dist/src/modules/system/role/entities/role.entity.js'
import { ScheduledTaskEntity, TaskExecutionEntity } from '../dist/src/modules/tasks/task.entity.js'
import { TasksService } from '../dist/src/modules/tasks/tasks.service.js'
import SysUserRoleEntity from '../dist/src/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import { initializeBaseData } from '../dist/src/scripts/setup-data.js'
import { RabbitMqService } from '../dist/src/shared/rabbitmq/rabbitmq.service.js'
import 'reflect-metadata'

// 容器直接使用继承连接；宿主机读取独立开发配置但不打印任何凭据。
if (!process.env.TASK_TEST_DATABASE) {
  const env = parse(await readFile('../../.env.docker.dev', 'utf8'))
  Object.assign(process.env, { TASK_TEST_DATABASE: 'kuvibe_task_verify', TYPEORM_HOST: '127.0.0.1', TYPEORM_PORT: env.DOCKER_POSTGRES_PORT ?? '55432', TYPEORM_USERNAME: env.POSTGRES_USER, TYPEORM_PASSWORD: env.POSTGRES_PASSWORD, TYPEORM_DATABASE: env.POSTGRES_DB, RABBITMQ_HOST: '127.0.0.1', RABBITMQ_PORT: env.DOCKER_RABBITMQ_PORT ?? '5673', RABBITMQ_USERNAME: env.RABBITMQ_USERNAME, RABBITMQ_PASSWORD: env.RABBITMQ_PASSWORD, RABBITMQ_VHOST: env.RABBITMQ_VHOST, REDIS_HOST: '127.0.0.1', REDIS_PORT: env.DOCKER_REDIS_PORT ?? '56379', REDIS_PASSWORD: env.REDIS_PASSWORD })
}
assert.equal(process.env.TASK_TEST_DATABASE, 'kuvibe_task_verify')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
const database = `kuvibe_task_verify_${randomUUID().replaceAll('-', '')}`
const options = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD, synchronize: false, migrationsRun: false, extra: { max: 12, options: '-c timezone=UTC' } }
const admin = await new DataSource({ ...options, database: process.env.TYPEORM_DATABASE }).initialize()
const files = (await readdir('dist/src/migrations')).filter(file => file.endsWith('.js') && !file.startsWith('1790800000000'))
const source = new DataSource({ ...options, database, entities: ['dist/src/**/*.entity.js'], migrations: files.map(file => `dist/src/migrations/${file}`) })
const second = new DataSource({ ...options, database, entities: ['dist/src/**/*.entity.js'] })
const migration = new AddTaskScheduling1790800000000()
const transports = []
const registries = []
const queue = `kuvibe.task.verify.${randomUUID()}`
const mqConfig = new ConfigService({ RABBITMQ_ENABLED: true, RABBITMQ_HOST: process.env.RABBITMQ_HOST, RABBITMQ_PORT: process.env.RABBITMQ_PORT, RABBITMQ_USERNAME: process.env.RABBITMQ_USERNAME, RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD, RABBITMQ_VHOST: process.env.RABBITMQ_VHOST, RABBITMQ_QUEUE: queue, RABBITMQ_PREFETCH: 2 })
let child
let childOutput = ''
let passed = 0
async function check(name, run) {
  await run()
  console.log(`PASS ${++passed}: ${name}`)
}
async function waitFor(predicate, milliseconds = 10000) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    if (await predicate())
      return
    await delay(50)
  }
  throw new Error('等待测试条件超时')
}
function registry() {
  const value = new SchedulerRegistry()
  registries.push(value)
  return value
}
const config = new ConfigService({ TASK_LOG_RETENTION_DAYS: 30 })
async function direction(name) {
  const runner = source.createQueryRunner()
  await runner.connect()
  await runner.startTransaction()
  try {
    await migration[name](runner)
    await runner.commitTransaction()
  }
  catch (error) {
    await runner.rollbackTransaction()
    throw error
  }
  finally { await runner.release() }
}

try {
  await admin.query(`CREATE DATABASE "${database}"`)
  await source.initialize()
  await source.runMigrations()
  const oldUser = await source.getRepository(SysUserEntity).save({ username: 'task_old_data', name: '旧用户保留', passwordHash: '$argon2id$fixture', timezone: 'Asia/Shanghai' })
  await source.query(`INSERT INTO biz_billing_outbox(type,business_key,aggregate_id) VALUES ('order_expire','old-preserved',1)`)
  const snapshot = () => source.query('SELECT id::text,username,name,timezone,created_at,updated_at FROM sys_user WHERE id=$1', [oldUser.id])
  const before = await snapshot()
  await check('旧数据 up/down/up 保留，候选迁移与全部实体零差异', async () => {
    for (const name of ['up', 'down', 'up']) {
      await direction(name)
      assert.deepEqual(await snapshot(), before)
      assert.equal((await source.query(`SELECT COUNT(*)::int AS count FROM biz_billing_outbox WHERE business_key='old-preserved'`))[0].count, 1)
    }
    assert.deepEqual((await source.driver.createSchemaBuilder().log()).upQueries.map(query => query.query), [])
  })
  await second.initialize()
  await check('回滚先锁表：并发未提交审计写入导致超时，结构与旧数据均保留', async () => {
    const writer = second.createQueryRunner()
    await writer.connect()
    await writer.startTransaction()
    try {
      await writer.query(`INSERT INTO sys_task_execution(task_id,task_name,handler_key,trigger,status,dispatch_key,started_at) VALUES (1,'并发审计','billing.outbox','manual','success',$1,NOW())`, [randomUUID()])
      await assert.rejects(direction('down'), error => error.code === '55P03')
      assert.deepEqual(await snapshot(), before)
      assert.equal(await source.getRepository(ScheduledTaskEntity).count(), 2)
    }
    finally {
      await writer.rollbackTransaction()
      await writer.release()
    }
  })
  await source.query('UPDATE sys_scheduled_task SET enabled=false')
  let calls = 0
  let gate
  const handler = { cleanup: async () => {
    calls++
    if (gate)
      await gate
  } }
  const service = new TasksService(source, registry(), { dispatch: async () => {} }, handler, config)
  const other = new TasksService(second, registry(), { dispatch: async () => {} }, handler, config)
  const dto = { name: '可配置测试任务', handlerKey: 'attachments.cleanup', cronExpression: '0 0 0 1 1 *', timeZone: 'Asia/Shanghai', enabled: false, description: null }
  let task
  await check('CRUD、唯一名称、非法 cron/时区/处理器、重启恢复及跨实例同步', async () => {
    for (const invalid of [{ handlerKey: 'shell.execute' }, { cronExpression: 'x x x x x x' }, { cronExpression: '* * * * *' }, { timeZone: 'Not/AZone' }]) await assert.rejects(service.create({ ...dto, ...invalid }))
    task = await service.create(dto)
    await assert.rejects(service.create(dto), /名称已存在/)
    assert.equal((await service.list({ page: 1, pageSize: 20, keyword: '可配置', enabled: false })).total, 1)
    await service.status(task.id, true)
    await other.synchronize()
    assert.ok(other.registry.doesExist('cron', `task:${task.id}`))
    await service.update(task.id, { ...dto, name: '已更新任务', enabled: true })
    await other.synchronize()
    assert.ok(other.registry.doesExist('cron', `task:${task.id}`))
    await service.status(task.id, false)
    await other.synchronize()
    assert.equal(other.registry.doesExist('cron', `task:${task.id}`), false)
  })
  await check('同周期两实例去重、同任务互斥、不同配置的同处理器互斥', async () => {
    await source.query(`UPDATE sys_scheduled_task SET enabled=true,next_run_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [task.id])
    const configuredAt = (await source.getRepository(ScheduledTaskEntity).findOneByOrFail({ id: task.id })).updatedAt
    calls = 0
    await Promise.allSettled([service.run(task.id, 'cron'), other.run(task.id, 'cron')])
    await other.run(task.id, 'cron')
    assert.equal(calls, 1)
    assert.deepEqual((await source.getRepository(ScheduledTaskEntity).findOneByOrFail({ id: task.id })).updatedAt, configuredAt)
    let release
    gate = new Promise((resolve) => {
      release = resolve
    })
    const firstRun = service.run(task.id)
    await waitFor(() => calls === 2)
    await assert.rejects(other.run(task.id), /正在执行/)
    await assert.rejects(other.status(task.id, false), /正在执行/)
    const duplicate = await other.create({ ...dto, name: '同处理器任务' })
    assert.equal((await other.run(duplicate.id)).status, 'skipped')
    release()
    gate = undefined
    assert.equal((await firstRun).status, 'success')
    await service.remove(duplicate.id)
  })
  await check('日志脱敏、日志保留及中断恢复、删除任务历史可查、已使用迁移阻断回滚', async () => {
    const failed = new TasksService(source, registry(), {}, { cleanup: async () => {
      throw new Error('sensitive-secret')
    } }, config)
    const log = await failed.run(task.id)
    assert.equal(log.status, 'failed')
    assert.equal(log.errorCode, 'handler_failed')
    assert.equal(JSON.stringify(log).includes('sensitive-secret'), false)
    await source.getRepository(TaskExecutionEntity).save({ taskId: task.id, taskName: '遗留快照', handlerKey: 'attachments.cleanup', trigger: 'manual', status: 'running', dispatchKey: randomUUID(), startedAt: new Date(Date.now() - 11 * 60_000) })
    await source.getRepository(TaskExecutionEntity).save({ taskId: task.id, taskName: '过期快照', handlerKey: 'attachments.cleanup', trigger: 'manual', status: 'success', dispatchKey: randomUUID(), startedAt: new Date(Date.now() - 31 * 86400000) })
    await service.remove(task.id)
    await service.pruneLogs()
    const logs = await service.logs(task.id, { page: 1, pageSize: 100 })
    assert.ok(logs.items.some(item => item.errorCode === 'execution_interrupted'))
    assert.equal(logs.items.some(item => item.taskName === '过期快照'), false)
    assert.ok((await service.logs(undefined, { page: 1, pageSize: 100 })).items.some(item => item.taskId === task.id))
    await assert.rejects(direction('down'), /默认任务已变更|执行日志已使用/)
    assert.ok(await source.getRepository(TaskExecutionEntity).count())
  })
  await check('四任务同周期按处理器公平排队、两并发、重复合并、排队停用与关机清理', async () => {
    let release
    const blocked = new Promise((resolve) => {
      release = resolve
    })
    let entered = 0
    let concurrent = 0
    let maximum = 0
    const handle = async () => {
      entered++
      concurrent++
      maximum = Math.max(maximum, concurrent)
      await blocked
      concurrent--
    }
    const fair = new TasksService(source, registry(), { dispatch: handle }, { cleanup: handle }, config)
    const jobs = []
    for (let index = 0; index < 4; index++) jobs.push(await fair.create({ ...dto, name: `公平排队 ${index}`, enabled: true, handlerKey: index % 2 ? 'billing.outbox' : 'attachments.cleanup' }))
    await source.query(`UPDATE sys_scheduled_task SET next_run_at=NOW()-INTERVAL '1 second' WHERE id=ANY($1::bigint[])`, [jobs.map(job => job.id)])
    const executions = jobs.map(job => fair.enqueueCron(job.id, job.handlerKey))
    await waitFor(() => entered === 2)
    assert.equal(fair.active.size, 2)
    assert.equal(fair.pendingCron.size, 2)
    assert.equal(await fair.enqueueCron(jobs[3].id, jobs[3].handlerKey), null)
    await fair.status(jobs[3].id, false)
    release()
    const results = await Promise.all(executions)
    assert.equal(entered, 3)
    assert.equal(maximum, 2)
    assert.equal(results[3], null)
    assert.ok(results.slice(0, 3).every(log => log.status === 'success'))
    assert.equal(fair.pendingCron.size, 0)
    await fair.onModuleDestroy()
    let unblock
    const held = new Promise((resolve) => {
      unblock = resolve
    })
    let running = false
    const closing = new TasksService(source, registry(), {}, { cleanup: async () => {
      running = true
      await held
    } }, config)
    const first = await closing.create({ ...dto, name: '关闭时运行', enabled: true })
    const last = await closing.create({ ...dto, name: '关闭时排队', enabled: true })
    await source.query(`UPDATE sys_scheduled_task SET next_run_at=NOW()-INTERVAL '1 second' WHERE id=ANY($1::bigint[])`, [[first.id, last.id]])
    const executing = closing.enqueueCron(first.id, first.handlerKey)
    await waitFor(() => running)
    const waiting = closing.enqueueCron(last.id, last.handlerKey)
    const shutdown = closing.onModuleDestroy()
    assert.equal(await waiting, null)
    assert.equal(closing.pendingCron.size, 0)
    unblock()
    await executing
    await shutdown
    assert.equal(closing.active.size, 0)
    for (const job of [...jobs, first, last]) await service.remove(job.id)
  })
  await check('真实 RabbitMQ 发布确认、重复投递领取一次、队列取消后重连、旧租约无法完成', async () => {
    process.env.BILLING_WORKER_ENABLED = 'true'
    const outbox = new BillingOutboxService(source)
    const mq = new RabbitMqService(mqConfig)
    transports.push(mq)
    let consumed = 0
    const worker = new BillingWorker(outbox, { expire: async () => {
      consumed++
      await delay(60)
    } }, {}, undefined, undefined, mq)
    await worker.onModuleInit()
    await mq.publish('1')
    await mq.publish('1')
    await waitFor(async () => (await source.query('SELECT status FROM biz_billing_outbox WHERE id=1'))[0].status === 'done')
    assert.equal(consumed, 1)
    const insert = await source.query(`INSERT INTO biz_billing_outbox(type,business_key,aggregate_id) VALUES ('order_expire','expired-lease',1) RETURNING id::text`)
    const oldLease = await outbox.claimById(insert[0].id, ['order_expire'])
    await source.query(`UPDATE biz_billing_outbox SET leased_until=NOW()-INTERVAL '1 second' WHERE id=$1`, [oldLease.id])
    const current = await outbox.claimById(oldLease.id, ['order_expire'])
    assert.equal(await outbox.complete(oldLease), false)
    assert.equal(await outbox.complete(current), true)
    const connection = await connect({ hostname: process.env.RABBITMQ_HOST, port: Number(process.env.RABBITMQ_PORT), username: process.env.RABBITMQ_USERNAME, password: process.env.RABBITMQ_PASSWORD, vhost: process.env.RABBITMQ_VHOST })
    const channel = await connection.createChannel()
    await channel.deleteQueue(queue)
    await waitFor(() => !mq.connection)
    await mq.reconnect()
    mq.assertReady()
    const restored = await source.query(`INSERT INTO biz_billing_outbox(type,business_key,aggregate_id) VALUES ('order_expire','after-reconnect',1) RETURNING id::text`)
    await mq.publish(restored[0].id)
    await waitFor(async () => (await source.query('SELECT status FROM biz_billing_outbox WHERE id=$1', [restored[0].id]))[0].status === 'done')
    assert.equal(consumed, 2)
    const pending = await source.query(`INSERT INTO biz_billing_outbox(type,business_key,aggregate_id) VALUES ('payment_poll','channel-pending',1) RETURNING id::text`)
    const pendingWorker = new BillingWorker(outbox, {}, { poll: async () => {
      throw new ChannelPendingError()
    } })
    await pendingWorker.tick()
    const [state] = await source.query('SELECT status,attempts FROM biz_billing_outbox WHERE id=$1', [pending[0].id])
    assert.equal(state.status, 'pending')
    assert.equal(state.attempts, 0)
    await mq.onModuleDestroy()
    await channel.deleteQueue(queue)
    // 真实领域订单通过消息到期关单，沿用订单/额度/当前订单投影的原事务。
    const buyer = await source.getRepository(SysUserEntity).save({ username: `mq_buyer_${randomUUID()}`, name: '消息订单测试', passwordHash: '$argon2id$fixture' })
    const quotas = new QuotaService()
    const catalog = new CatalogService(source, quotas)
    const orders = new OrdersService(source, catalog, quotas, outbox)
    const pack = await catalog.createPackage({ code: `mq_${randomUUID().replaceAll('-', '')}`, title: '消息订单套餐', priceMinor: '1000', basePoints: '1000', giftPoints: '0', totalLimit: '3' }, buyer.id)
    await catalog.publishPackage(pack.id, 'enabled')
    await source.query(`CREATE FUNCTION task_fixture_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=${buyer.id} THEN NEW.expires_at=NOW()-INTERVAL '1 second'; END IF; RETURN NEW; END; $$`)
    await source.query('CREATE TRIGGER task_fixture_expiry BEFORE INSERT ON biz_recharge_order FOR EACH ROW EXECUTE FUNCTION task_fixture_expiry()')
    const order = await orders.create(buyer.id, { packageId: pack.id, versionId: pack.versionId, channel: 'wechat', client: 'qr', idempotencyKey: randomUUID(), payableMinor: pack.priceMinor })
    await source.query('DROP TRIGGER task_fixture_expiry ON biz_recharge_order')
    await source.query('DROP FUNCTION task_fixture_expiry()')
    await source.query(`UPDATE biz_billing_outbox SET available_at=NOW() WHERE type='order_expire' AND aggregate_id=$1`, [order.id])
    const realMq = new RabbitMqService(mqConfig)
    transports.push(realMq)
    const realWorker = new BillingWorker(outbox, orders, {}, undefined, undefined, realMq)
    await realWorker.onModuleInit()
    await realWorker.dispatch()
    await waitFor(async () => (await source.query('SELECT status FROM biz_recharge_order WHERE id=$1', [order.id]))[0].status === 'closed')
    const [balance] = await source.query(`SELECT (SELECT COUNT(*) FROM biz_order_reservation WHERE order_id=$1 AND status='held')::int AS held,(SELECT current_order_id FROM biz_recharge_user_state WHERE user_id=$2) AS current`, [order.id, buyer.id])
    assert.equal(balance.held, 0)
    assert.equal(balance.current, null)
    await realMq.onModuleDestroy()
    await channel.deleteQueue(queue)
    await connection.close()
    process.env.BILLING_WORKER_ENABLED = 'false'
  })
  await check('权限种子可重复执行、普通用户无任务权限、真实 HTTP DTO/CRUD/日志/权限', async () => {
    await initializeBaseData(source)
    await initializeBaseData(source)
    assert.equal((await source.query(`SELECT count(*)::int AS count FROM sys_menu WHERE auth_code LIKE 'system:task:%' AND deleted_at IS NULL`))[0].count, 6)
    const roles = source.getRepository(SysRoleEntity)
    const superRole = await roles.save({ name: '任务验收管理员', code: 'super', status: 1 })
    for (const [username, roleCode] of [['tasks_admin', 'super'], ['tasks_member', 'user']]) {
      const row = source.getRepository(SysUserEntity).create({ username, name: username, status: 1, homePath: '/system/tasks' })
      await row.setPassword('Task-Test-Only-2026!')
      await source.getRepository(SysUserEntity).save(row)
      const role = roleCode === 'super' ? superRole : await roles.findOneByOrFail({ code: roleCode })
      await source.getRepository(SysUserRoleEntity).save({ userId: row.id, roleId: role.id })
    }
    const port = Number(process.env.TASK_TEST_PORT ?? 7003)
    const origin = `http://127.0.0.1:${port}`
    const httpEnv = { ...process.env, NODE_ENV: 'test', TYPEORM_TYPE: 'postgres', TYPEORM_DATABASE: database, TYPEORM_SYNCHRONIZE: 'false', APP_NAME: '任务隔离验收', APP_BASE_URL: origin, APP_CORS_ORIGINS: 'http://localhost:5999,http://localhost:5555', APP_PORT: String(port), AUTH_COOKIE_SECURE: 'false', AUTH_COOKIE_SAME_SITE: 'lax', REDIS_DB: '14', JWT_SECRET: randomUUID(), JWT_EXPIRE: '3600', REFRESH_TOKEN_SECRET: randomUUID(), REFRESH_TOKEN_EXPIRE: '86400', SWAGGER_ENABLE: 'true', SWAGGER_PATH: 'api-docs', RABBITMQ_ENABLED: 'false', BILLING_WORKER_ENABLED: 'false' }
    child = spawn(process.execPath, ['dist/src/main.js'], { env: httpEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => {
      childOutput += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      childOutput += chunk.toString()
    })
    await waitFor(async () => {
      try {
        return (await fetch(`${origin}/api/timezone/getTimezoneOptions`)).ok
      }
      catch { return false }
    }, 30000)
    // 相同端口启动失败时，已初始化的动态任务和 RabbitMQ 消费者必须关闭并退出。
    const blocked = spawn(process.execPath, ['dist/src/main.js'], { env: { ...httpEnv, RABBITMQ_ENABLED: 'true', BILLING_WORKER_ENABLED: 'true', RABBITMQ_QUEUE: queue }, stdio: ['ignore', 'ignore', 'pipe'] })
    let blockedError = ''
    blocked.stderr.on('data', (chunk) => {
      blockedError += chunk.toString()
    })
    try {
      await waitFor(() => blocked.exitCode !== null, 20000)
      assert.equal(blocked.exitCode, 1)
      assert.ok(blockedError.includes('EADDRINUSE'))
      const inspection = await connect({ hostname: process.env.RABBITMQ_HOST, port: Number(process.env.RABBITMQ_PORT), username: process.env.RABBITMQ_USERNAME, password: process.env.RABBITMQ_PASSWORD, vhost: process.env.RABBITMQ_VHOST })
      try {
        const channel = await inspection.createChannel()
        assert.equal((await channel.checkQueue(queue)).consumerCount, 0)
      }
      finally { await inspection.close() }
      console.log('启动端口冲突退出码 1，RabbitMQ 本次队列消费者 0，无孤儿消费者')
    }
    finally {
      if (blocked.exitCode === null)
        blocked.kill('SIGKILL')
    }
    async function request(path, method = 'GET', body, token) {
      const reply = await fetch(`${origin}/api${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
      return { status: reply.status, body: await reply.json() }
    }
    const login = async (username) => {
      const result = await request('/auth/login', 'POST', { username, password: 'Task-Test-Only-2026!' })
      assert.equal(result.status, 201, `隔离 fixture 登录失败：HTTP ${result.status} / code ${result.body.code}`)
      assert.equal(typeof result.body.data?.accessToken, 'string')
      return result.body.data.accessToken
    }
    const token = await login('tasks_admin')
    const member = await login('tasks_member')
    assert.equal((await request('/system/tasks')).status, 401)
    assert.equal((await request('/system/tasks', 'GET', undefined, member)).status, 403)
    for (const [path, method, body] of [['/system/tasks', 'POST', dto], ['/system/tasks/1/status', 'POST', { enabled: false }], ['/system/tasks/1/run', 'POST'], ['/system/tasks/logs', 'GET']]) assert.equal((await request(path, method, body, member)).status, 403)
    assert.equal((await request('/system/tasks/9999999999/run', 'POST', undefined, token)).status, 422)
    assert.equal((await request('/system/tasks?pageSize=101', 'GET', undefined, token)).status, 422)
    assert.equal((await request('/system/tasks', 'POST', { ...dto, enabled: 'false' }, token)).status, 422)
    const created = await request('/system/tasks', 'POST', { ...dto, name: 'HTTP 验收任务' }, token)
    assert.equal(created.status, 200)
    const id = created.body.data.id
    assert.equal(typeof id, 'string')
    assert.equal((await request(`/system/tasks/${id}`, 'PATCH', { ...dto, name: 'HTTP 更新任务' }, token)).status, 200)
    const run = await request(`/system/tasks/${id}/run`, 'POST', undefined, token)
    assert.equal(run.status, 200)
    assert.equal(run.body.data.status, 'success')
    assert.equal((await request(`/system/tasks/${id}/status`, 'POST', { enabled: true }, token)).status, 200)
    assert.equal((await request(`/system/tasks/${id}`, 'DELETE', undefined, token)).status, 200)
    assert.ok((await request('/system/tasks/logs', 'GET', undefined, token)).body.data.items.some(item => item.taskId === id))
    console.log(`HTTP 验收入口 ${origin}；专用 fixture tasks_admin/tasks_member；实体、迁移与消息独立于日常数据`)
  })
  await check('五万日志样本分页使用索引，列表数据与统计无需全量加载到应用', async () => {
    await source.query(`INSERT INTO sys_task_execution(task_id,task_name,handler_key,trigger,status,dispatch_key,started_at,finished_at,duration_ms) SELECT 100000+(n%1000),'查询样本','attachments.cleanup','cron','success',$1||n::text,NOW()-(n*INTERVAL '1 second'),NOW(),1 FROM generate_series(1,50000) n`, [`sample:${randomUUID()}:`])
    await source.query('ANALYZE sys_task_execution')
    const [row] = await source.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM sys_task_execution WHERE task_id=100005 ORDER BY id DESC LIMIT 20`)
    const result = row['QUERY PLAN'][0]
    const serialized = JSON.stringify(result.Plan)
    assert.ok(serialized.includes('idx_task_execution_page'))
    console.log(`日志查询样本 50000 条；复合索引 idx_task_execution_page；本次数据库执行 ${result['Execution Time']} ms（开发环境观察，不代表生产容量）`)
  })
  if (process.env.TASK_TEST_BROWSER_HOLD === 'true') {
    console.log('TASK_BROWSER_READY')
    await new Promise((resolve) => {
      process.once('SIGTERM', resolve)
      process.once('SIGINT', resolve)
    })
  }
  console.log(`调度模块验收通过 ${passed} 项`)
}
catch (error) {
  // 不输出子进程请求体/JWT；输出有限启动故障文字且去除敏感字段。
  if (childOutput) {
    let safe = childOutput.split('\n').filter(line => /UnknownDependenciesException|Error:|Cannot find|ModuleRef|ValidationError|Nest can't|ECONNREFUSED|EADDRINUSE/.test(line)).join('\n').slice(-3000)
    for (const [name, value] of Object.entries(process.env)) {
      if (/PASSWORD|SECRET|TOKEN/.test(name) && value)
        safe = safe.replaceAll(value, '[redacted]')
    }
    console.error(safe)
  }
  throw error
}
finally {
  child?.kill('SIGTERM')
  if (child)
    await delay(1000)
  await Promise.allSettled(transports.map(transport => transport.onModuleDestroy()))
  // 失败路径同样只清理本次随机队列，避免遗留持久队列。
  const cleanupConnection = await connect({ hostname: process.env.RABBITMQ_HOST, port: Number(process.env.RABBITMQ_PORT), username: process.env.RABBITMQ_USERNAME, password: process.env.RABBITMQ_PASSWORD, vhost: process.env.RABBITMQ_VHOST }).catch(() => undefined)
  if (cleanupConnection) {
    try {
      const channel = await cleanupConnection.createChannel()
      await channel.deleteQueue(queue)
    }
    finally { await cleanupConnection.close() }
  }
  for (const value of registries) {
    for (const name of value.getCronJobs().keys()) value.deleteCronJob(name)
  }
  if (second.isInitialized)
    await second.destroy()
  if (source.isInitialized)
    await source.destroy()
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  await admin.destroy()
}
