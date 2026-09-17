/* eslint-disable antfu/no-import-dist -- 使用 Node 原生测试验证构建产物与隔离 PostgreSQL。 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { TimezoneService } from '../dist/src/modules/timezone/timezone.service.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

test('UTC、上海和纽约进程生成相同业务日边界', () => {
  const source = `
    import { getBusinessDateRange, getBusinessDayRange } from './dist/src/utils/time.util.js';
    console.log(JSON.stringify([
      getBusinessDateRange('2026-09-10', '2026-10-08', 'Asia/Shanghai'),
      getBusinessDayRange('2026-03-08', 'America/New_York'),
      getBusinessDayRange('2026-11-01', 'America/New_York'),
    ]));
  `
  const outputs = ['UTC', 'Asia/Shanghai', 'America/New_York'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ }, encoding: 'utf8' }))
  assert.equal(outputs[0], outputs[1])
  assert.equal(outputs[1], outputs[2])
})

test('所有实体时间点列均显式采用 timestamptz 默认精度', async () => {
  const source = new DataSource({ type: 'postgres', entities: ['dist/src/**/*.entity.js'] })
  await source.buildMetadatas()
  const names = new Set(['createdAt', 'updatedAt', 'deletedAt', 'expired_at', 'expiresAt'])
  let count = 0
  for (const entity of source.entityMetadatas) {
    for (const column of entity.columns.filter(column => names.has(column.propertyName))) {
      assert.equal(column.type, 'timestamptz', `${entity.name}.${column.propertyName}`)
      assert.equal(column.precision, undefined)
      count++
    }
  }
  assert.ok(count > 30)
})

test('PostgreSQL 偏好持久化、用户隔离、部分更新及跨会话时区时间点读写', { skip: !process.env.TIMEZONE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.TIMEZONE_TEST_DATABASE_URL)
  assert.equal(url.pathname, '/m6_test')
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  const schema = `m6_${randomUUID().replaceAll('-', '')}`
  const config = { type: 'postgres', url: url.toString(), schema, entities: ['dist/src/**/*.entity.js'], synchronize: false, extra: { options: '-c timezone=UTC' } }
  const source = new DataSource(config)
  let reopened
  try {
    await source.initialize()
    await source.query(`CREATE SCHEMA "${schema}"`)
    await source.synchronize()
    const [column] = await source.query(
      'SELECT datetime_precision FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3',
      [schema, 'sys_user', 'created_at'],
    )
    assert.equal(column.datetime_precision, 6, 'PostgreSQL 使用默认微秒精度')
    const users = source.getRepository(SysUserEntity)
    const inserted = await users.insert([
      { username: 'm6_one', name: '甲', passwordHash: '$argon2id$test-only', timezone: null },
      { username: 'm6_two', name: '乙', passwordHash: '$argon2id$test-only', timezone: 'Asia/Seoul' },
    ])
    const [first, second] = inserted.identifiers.map(value => value.id)
    const invalidations = []
    const service = new TimezoneService(users, { delCache: async key => invalidations.push(key) })
    assert.equal(await service.getTimezone(first), null)
    await service.setTimezone(first, 'Asia/Tokyo')
    assert.equal(await service.getTimezone(second), 'Asia/Seoul')
    assert.equal((await users.findOneByOrFail({ id: first })).name, '甲')
    assert.equal((await users.findOneByOrFail({ id: first })).updatedBy, first)
    assert.equal(invalidations.length, 1)

    reopened = await new DataSource(config).initialize()
    const afterRestart = new TimezoneService(reopened.getRepository(SysUserEntity), { delCache: async () => {} })
    assert.equal(await afterRestart.getTimezone(first), 'Asia/Tokyo')
    await afterRestart.setTimezone(first, null)
    assert.equal(await service.getTimezone(first), null)
    await users.update(first, { status: 0 })
    await assert.rejects(service.setTimezone(first, 'UTC'))
    await users.update(first, { status: 1 })

    const runner = source.createQueryRunner()
    try {
      await runner.connect()
      assert.equal((await runner.query('SHOW TIME ZONE'))[0].TimeZone, 'UTC')
      const instant = new Date('2026-09-17T02:00:00.123Z')
      for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
        await runner.query('SELECT set_config($1, $2, false)', ['TimeZone', zone])
        await runner.manager.getRepository(SysUserEntity).insert({ username: `zone_${zone.replaceAll('/', '_')}`, name: '时间点', passwordHash: '$argon2id$test-only', createdAt: instant })
        const saved = await runner.manager.getRepository(SysUserEntity).findOneByOrFail({ username: `zone_${zone.replaceAll('/', '_')}` })
        assert.equal(saved.createdAt.toISOString(), instant.toISOString())
      }
    }
    finally {
      await runner.release()
    }
    await source.query(
      `INSERT INTO "${schema}"."sys_user" (username, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4::timestamptz), ($5, $2, $3, $6::timestamptz)`,
      ['boundary_before', '边界', '$argon2id$test-only', '2026-09-17T23:59:59.999999Z', 'boundary_after', '2026-09-18T00:00:00Z'],
    )
    const boundaryRows = await users.createQueryBuilder('user')
      .where('user.username IN (:...names)', { names: ['boundary_before', 'boundary_after'] })
      .andWhere('user.createdAt >= :startAt', { startAt: new Date('2026-09-17T00:00:00Z') })
      .andWhere('user.createdAt < :endAt', { endAt: new Date('2026-09-18T00:00:00Z') })
      .getMany()
    assert.deepEqual(boundaryRows.map(row => row.username), ['boundary_before'])
    await users.softDelete(first)
    await assert.rejects(service.getTimezone(first))
    await assert.rejects(service.setTimezone(first, 'UTC'))
  }
  finally {
    if (reopened?.isInitialized)
      await reopened.destroy()
    if (source.isInitialized) {
      await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await source.destroy()
    }
  }
})
