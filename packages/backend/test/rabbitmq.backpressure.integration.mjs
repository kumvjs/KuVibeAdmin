/* eslint-disable antfu/no-top-level-await, antfu/no-import-dist -- 隔离 PostgreSQL/RabbitMQ 重连背压验证，不使用业务账户。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { ConfigService } from '@nestjs/config'
import { connect } from 'amqplib'
import { parse } from 'dotenv'
import { DataSource } from 'typeorm'
import { BillingOutboxEntity } from '../dist/src/modules/billing/orders/entities/billing-outbox.entity.js'
import { BillingOutboxService } from '../dist/src/modules/billing/orders/outbox.service.js'
import { RabbitMqService } from '../dist/src/shared/rabbitmq/rabbitmq.service.js'
import 'reflect-metadata'

// 维护归属：任务调度模块。只创建/删除本次随机测试库与随机队列。
if (!process.env.TASK_TEST_DATABASE) {
  const env = parse(await readFile('../../.env.docker.dev', 'utf8'))
  Object.assign(process.env, { TASK_TEST_DATABASE: 'kuvibe_task_verify', TYPEORM_HOST: '127.0.0.1', TYPEORM_PORT: env.DOCKER_POSTGRES_PORT ?? '55432', TYPEORM_USERNAME: env.POSTGRES_USER, TYPEORM_PASSWORD: env.POSTGRES_PASSWORD, TYPEORM_DATABASE: env.POSTGRES_DB, RABBITMQ_HOST: '127.0.0.1', RABBITMQ_PORT: env.DOCKER_RABBITMQ_PORT ?? '5673', RABBITMQ_USERNAME: env.RABBITMQ_USERNAME, RABBITMQ_PASSWORD: env.RABBITMQ_PASSWORD, RABBITMQ_VHOST: env.RABBITMQ_VHOST })
}
assert.equal(process.env.TASK_TEST_DATABASE, 'kuvibe_task_verify')
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(process.env.TYPEORM_HOST))
const database = `kuvibe_task_verify_${randomUUID().replaceAll('-', '')}`
const queue = `kuvibe.task.verify.${randomUUID()}`
const options = { type: 'postgres', host: process.env.TYPEORM_HOST, port: Number(process.env.TYPEORM_PORT), username: process.env.TYPEORM_USERNAME, password: process.env.TYPEORM_PASSWORD }
const admin = await new DataSource({ ...options, database: process.env.TYPEORM_DATABASE }).initialize()
const source = new DataSource({ ...options, database, entities: [BillingOutboxEntity], synchronize: true })
const credentials = { hostname: process.env.RABBITMQ_HOST, port: Number(process.env.RABBITMQ_PORT), username: process.env.RABBITMQ_USERNAME, password: process.env.RABBITMQ_PASSWORD, vhost: process.env.RABBITMQ_VHOST }
const mq = new RabbitMqService(new ConfigService({ RABBITMQ_ENABLED: true, RABBITMQ_HOST: credentials.hostname, RABBITMQ_PORT: credentials.port, RABBITMQ_USERNAME: credentials.username, RABBITMQ_PASSWORD: credentials.password, RABBITMQ_VHOST: credentials.vhost, RABBITMQ_QUEUE: queue, RABBITMQ_PREFETCH: 2 }))
let release
const blocked = new Promise((resolve) => {
  release = resolve
})
async function waitFor(predicate) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await predicate())
      return
    await delay(25)
  }
  throw new Error('重连背压测试等待超时')
}
try {
  await admin.query(`CREATE DATABASE "${database}"`)
  await source.initialize()
  const outbox = new BillingOutboxService(source)
  const rows = await source.getRepository(BillingOutboxEntity).save(Array.from({ length: 4 }, (_, index) => ({ type: 'order_expire', aggregateId: String(index + 1), businessKey: `backpressure:${index}` })))
  let entered = 0
  let running = 0
  let maximum = 0
  await mq.subscribe(async (id) => {
    const lease = await outbox.claimById(id, ['order_expire'])
    if (!lease)
      return
    entered++
    running++
    maximum = Math.max(maximum, running)
    await blocked
    assert.equal(await outbox.complete(lease), true)
    running--
  })
  await mq.publish(rows[0].id)
  await mq.publish(rows[1].id)
  await waitFor(() => entered === 2)
  const previous = mq.connection
  await previous.close()
  await waitFor(() => !mq.connection)
  mq.retryAt = 0
  await mq.reconnect()
  assert.ok(mq.connection && mq.connection !== previous)
  await mq.publish(rows[2].id)
  await mq.publish(rows[3].id)
  const inspection = await connect(credentials)
  try {
    const channel = await inspection.createChannel()
    await waitFor(async () => (await channel.checkQueue(queue)).messageCount === 0)
    await delay(100)
    assert.equal(mq.active.size, 2)
    assert.equal(entered, 2)
    assert.equal(maximum, 2)
    const deferred = await source.getRepository(BillingOutboxEntity).findBy({ status: 'pending' })
    assert.equal(deferred.length, 2)
    assert.ok(deferred.every(row => row.attempts === 0))
    release()
    await waitFor(() => mq.active.size === 0)
    for (const id of await outbox.dueIds(['order_expire'])) await mq.publish(id)
    await waitFor(async () => await source.getRepository(BillingOutboxEntity).countBy({ status: 'done' }) === 4)
    assert.equal(entered, 4)
    assert.ok(maximum <= 2)
    assert.ok((await source.getRepository(BillingOutboxEntity).find()).every(row => row.attempts === 1))
    console.log('PASS 重连期间旧 handler 保持阻塞：进程 active≤prefetch=2；新消息不领取，outbox 重投后四条全部完成且各领取一次')
  }
  finally { await inspection.close() }
}
finally {
  release()
  await mq.onModuleDestroy()
  const cleanup = await connect(credentials).catch(() => undefined)
  if (cleanup) {
    try {
      const channel = await cleanup.createChannel()
      await channel.deleteQueue(queue)
    }
    finally { await cleanup.close() }
  }
  if (source.isInitialized)
    await source.destroy()
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  await admin.destroy()
}
