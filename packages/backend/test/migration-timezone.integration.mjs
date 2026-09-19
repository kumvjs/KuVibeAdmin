/* eslint-disable antfu/no-import-dist -- 验证实际迁移构建产物与隔离 PostgreSQL。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { UpdateTable1789459958471 } from '../dist/src/migrations/1789459958471-update-table.js'
import { UpdateTable1789491815418 } from '../dist/src/migrations/1789491815418-update-table.js'
import { UpdateTable1789648814246 } from '../dist/src/migrations/1789648814246-update-table.js'

test('UTC 历史数据在非 UTC 会话中升级、回滚、再次升级均保持不变', async () => {
  assert.ok(process.env.MIGRATION_TEST_DATABASE_URL, '必须提供本次专用隔离数据库，禁止用日常数据库')
  const url = new URL(process.env.MIGRATION_TEST_DATABASE_URL)
  assert.equal(url.pathname, '/atlas_migration_test')
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  const source = await new DataSource({
    type: 'postgres',
    url: url.toString(),
    synchronize: false,
    entities: ['dist/src/**/*.entity.js'],
  }).initialize()
  const runner = source.createQueryRunner()
  try {
    await runner.connect()
    await runner.startTransaction()
    await runner.query('SET LOCAL TIME ZONE \'America/New_York\'')
    await runner.query('SET LOCAL lock_timeout = \'5s\'')
    await runner.query('SET LOCAL statement_timeout = \'30s\'')
    await new UpdateTable1789459958471().up(runner)
    await new UpdateTable1789491815418().up(runner)

    const fixtures = {
      sys_dept: { name: '迁移测试' },
      sys_menu: { name: '迁移菜单' },
      sys_role: { name: '迁移角色', code: 'migration-test' },
      sys_user: { username: 'migration-test', name: '迁移用户', password_hash: '$argon2id$fixture' },
      sys_role_menu: { role_id: '1', menu_id: '1' },
      sys_user_role: { user_id: '1', role_id: '1' },
      user_refresh_token: { value: 'expired-token', expired_at: '2020-03-08 07:30:00.123456', user_id: '1' },
      sys_captcha_log: {},
      sys_login_log: {},
      sys_attachment: {
        owner_id: '1',
        original_name: 'test.txt',
        extension: 'txt',
        mime_type: 'text/plain',
        size_bytes: '3',
        sha256: 'a'.repeat(64),
        storage_driver: 'local',
        object_key: 'migration-test',
        purpose: 'test',
        policy_revision: 1,
        expires_at: '2035-11-04T06:30:00.654321Z',
      },
      sys_attachment_audit: { attachment_id: '1', action: 'upload' },
      sys_attachment_reference: { attachment_id: '1', business_type: 'test', business_id: '1', field: 'file' },
      sys_upload_policy: {
        purpose: 'test',
        allowed_formats: '["txt"]',
        max_file_bytes: 1024,
        max_total_bytes: 1024,
        max_files: 1,
        retention_seconds: 60,
        revision: 1,
      },
    }
    for (const [table, values] of Object.entries(fixtures)) {
      const data = {
        ...values,
        created_at: '2020-03-08 07:30:00.123456',
        updated_at: '2021-11-07 06:30:00.654321',
        deleted_at: '2022-01-01 00:00:00.000001',
      }
      await runner.query(`INSERT INTO "${table}" (${Object.keys(data).map(key => `"${key}"`).join(',')}) VALUES (${Object.keys(data).map((_, i) => `$${i + 1}`).join(',')})`, Object.values(data))
    }
    await runner.query(`INSERT INTO user_refresh_token (value, expired_at, user_id) VALUES ('valid-token', '2099-01-01 00:00:00', 1)`)
    const columns = await runner.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
      ORDER BY table_name, ordinal_position`)
    assert.equal(columns.filter(c => c.data_type === 'timestamp without time zone').length, 40)
    const snapshot = async () => {
      const result = {}
      for (const table of Object.keys(fixtures)) {
        const times = columns.filter(c => c.table_name === table).map(c => c.column_name)
        const projections = times.map(name => `extract(epoch FROM "${name}")::text AS "${name}"`)
        result[table] = await runner.query(`SELECT id::text, ${projections.join(', ')} FROM "${table}" ORDER BY id`)
      }
      return result
    }
    const indexes = () => runner.query('SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = \'public\' ORDER BY indexname')
    const constraints = () => runner.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace ORDER BY conname`)
    const before = await snapshot()
    const beforeIndexes = await indexes()
    const beforeConstraints = await constraints()
    const migration = new UpdateTable1789648814246()
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](runner)
      assert.deepEqual(await snapshot(), before, `${direction} 保留微秒、NULL 和时间点`)
      assert.deepEqual(await indexes(), beforeIndexes, `${direction} 保留索引定义与顺序`)
      assert.deepEqual(await constraints(), beforeConstraints, `${direction} 保留约束`)
      const afterColumns = await runner.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
        ORDER BY table_name, ordinal_position`)
      assert.deepEqual(afterColumns, columns.map(c => ({ ...c, data_type: direction === 'up' ? 'timestamp with time zone' : c.data_type })))
      const [comment] = await runner.query(`SELECT col_description('user_refresh_token'::regclass, attnum) AS value
        FROM pg_attribute WHERE attrelid = 'user_refresh_token'::regclass AND attname = 'expired_at'`)
      assert.equal(comment.value, '令牌过期时间')
    }
    // 与实体做只读比较；使用同一事务连接以看见尚未提交的测试结构。
    const createRunner = source.createQueryRunner.bind(source)
    const release = runner.release.bind(runner)
    source.createQueryRunner = () => runner
    runner.release = async () => {}
    try {
      const diff = await source.driver.createSchemaBuilder().log()
      assert.deepEqual(diff.upQueries.map(q => q.query), [], '迁移后结构应与实体一致')
    }
    finally {
      source.createQueryRunner = createRunner
      runner.release = release
    }
    const [inserted] = await runner.query(`INSERT INTO sys_user (username, name, password_hash)
      VALUES ('after-migration', '新增用户', '$argon2id$fixture') RETURNING created_at = now() AS correct, deleted_at`)
    assert.equal(inserted.correct, true)
    assert.equal(inserted.deleted_at, null)
  }
  finally {
    if (runner.isTransactionActive)
      await runner.rollbackTransaction()
    await runner.release()
    await source.destroy()
  }
})
