/* eslint-disable antfu/no-import-dist -- 独立随机 PostgreSQL 数据库与专用真实 Redis 验证重构行为。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Module, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector, RouterModule } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { CatchEverythingFilter } from '../dist/src/common/filters/catch-everything.filter.js'
import { TransformInterceptor } from '../dist/src/common/interceptors/transform.interceptor.js'
import { RbacGuard } from '../dist/src/modules/auth/guards/rbac.guard.js'
import { DictBusinessController } from '../dist/src/modules/system/dict/dict-business.controller.js'
import { DictReadGuard } from '../dist/src/modules/system/dict/dict-read.guard.js'
import { DictController } from '../dist/src/modules/system/dict/dict.controller.js'
import { DictService } from '../dist/src/modules/system/dict/dict.service.js'
import { SysDictEntity } from '../dist/src/modules/system/dict/entities/dict.entity.js'
import { initializeBaseData } from '../dist/src/scripts/setup-data.js'
import { CacheService } from '../dist/src/shared/cache/cache.service.js'
import 'reflect-metadata'

const adminUrl = new URL(process.env.DICT_TEST_DATABASE_URL ?? '')
assert.equal(adminUrl.pathname, '/postgres')
assert.ok(['127.0.0.1', 'localhost'].includes(adminUrl.hostname))
const redisUrl = new URL(process.env.DICT_TEST_REDIS_URL ?? '')
assert.ok(['127.0.0.1', 'localhost'].includes(redisUrl.hostname))
assert.equal(redisUrl.pathname, '/15') // 专用测试容器 DB15；不得指向日常实例。
const database = `kuvibe_dict_test_${randomUUID().replaceAll('-', '')}`
const url = new URL(adminUrl)
url.pathname = `/${database}`
const config = { type: 'postgres', url: url.href, synchronize: false, migrationsRun: false, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], extra: { max: 16, options: '-c timezone=UTC' } }
let admin
let source
let redis
let cache
let service
let migration
let app
let sequence = 0
let permissions = []
const queries = []
const input = (fields = {}) => ({ name: `节点${++sequence}`, code: `test.node_${sequence}`, ...fields })
const create = fields => service.create(input(fields), '1')
const ids = rows => rows.map(row => row.id)
const probe = () => queries.filter(query => /FROM sys_dict/.test(query) && !query.includes('pg_advisory')).length
const adminKey = 'sys:dict:{1}:admin:list'
const descendantsKey = id => `sys:dict:{1}:descendants:${id}:enabled`

before(async () => {
  admin = await new DataSource({ type: 'postgres', url: adminUrl.href }).initialize()
  await admin.query(`CREATE DATABASE "${database}"`)
  source = await new DataSource({ ...config, logging: ['query'], logger: {
    logQuery(query) { queries.push(query) },
    logQueryError() {},
    logQuerySlow() {},
    logSchemaBuild() {},
    logMigration() {},
    log() {},
  } }).initialize()
  migration = source.migrations.find(item => (item.name ?? item.constructor.name).startsWith('DictCacheEnabled'))
  assert.ok(migration)
  source.migrations = source.migrations.filter(item => item !== migration)
  await source.runMigrations()
  redis = new Redis(redisUrl.href, { maxRetriesPerRequest: 1, commandTimeout: 150, connectTimeout: 300, enableOfflineQueue: false })
  await new Promise((resolve, reject) => {
    redis.once('ready', resolve)
    redis.once('error', reject)
  })
  cache = new CacheService({ getClient: () => redis })
  cache.onModuleInit()
  // 只删除本模块测试键，保留其他 Redis 数据。
  await cache.delCacheByPrefix('sys:dict:{1}:')
  service = new DictService(source.getRepository(SysDictEntity), cache)
})

after(async () => {
  await app?.close()
  if (redis?.status === 'ready') {
    await cache.delCacheByPrefix('sys:dict:{1}:')
    await cache.delCacheByPrefix('online:lock:sys:dict:{1}:')
  }
  redis?.disconnect()
  if (source?.isInitialized)
    await source.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await admin.destroy()
  }
})

test('新增 cache_enabled 保留全部旧字典/审计/软删除数据，up/down/up 与实体 diff', async () => {
  await source.query(`INSERT INTO sys_dict(name,code,value,created_at,deleted_at) VALUES ('旧字典','legacy.node','','2020-01-01T00:00:00.123456Z','2021-01-01T00:00:00.654321Z')`)
  const snapshot = manager => manager.query(`SELECT id::text,pid::text,name,code,value,status,order_no,remark,tenant_id::text,extract(epoch FROM created_at)::text AS created,extract(epoch FROM deleted_at)::text AS deleted FROM sys_dict ORDER BY id`)
  const original = await snapshot(source)
  await source.transaction(async (manager) => {
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](manager.queryRunner)
      assert.deepEqual(await snapshot(manager), original)
    }
  })
  assert.deepEqual(await source.query('SELECT cache_enabled FROM sys_dict'), [{ cache_enabled: false }])
  const metadata = await new DataSource({ ...config, migrations: [], entities: [SysDictEntity] }).initialize()
  try {
    assert.deepEqual((await metadata.driver.createSchemaBuilder().log()).upQueries.map(row => row.query), [])
  }
  finally { await metadata.destroy() }
  await source.query(`SELECT setval(pg_get_serial_sequence('sys_dict','id'),9007199254740993,false)`)
})

test('根/中间/叶子 children 与 descendants、hasChildren、非叶子值、空值、大 ID', async () => {
  const root = await create({ value: 'module' })
  const branch = await create({ pid: root.id, order: 10, value: '' })
  const leaf = await create({ pid: branch.id, value: '0' })
  const sibling = await create({ pid: root.id, order: 0 })
  assert.equal(root.id, '9007199254740993')
  queries.length = 0
  const children = await service.getChildren(root.id)
  assert.deepEqual(ids(children), [sibling.id, branch.id])
  assert.equal(probe(), 1)
  assert.ok(!queries.some(query => query.includes('tree AS')))
  assert.equal(children[1].hasChildren, true)
  assert.equal(children[1].value, '')
  assert.deepEqual(await service.getChildren(leaf.id), [])
  assert.deepEqual(ids(await service.getDescendants(root.id)), [sibling.id, branch.id, leaf.id])
  assert.deepEqual(await service.getDescendants(leaf.id), [])
  assert.deepEqual(ids(await service.getDescendants(branch.id, { includeSelf: true })), [branch.id, leaf.id])
  assert.equal((await service.getDescendants(branch.id, { format: 'tree' }))[0].value, '0')
  assert.equal((await service.detail(branch.id)).hasChildren, true)
  assert.equal((await service.detail(leaf.id)).hasChildren, false)
  assert.equal((await service.detail(leaf.id)).pathIds, undefined)
  await assert.rejects(service.getChildren('9223372036854775808'), /bigint/)
  await assert.rejects(service.getDescendants('9223372036854775807'), /不存在/)
})

test('管理全量缓存单次 SQL、flat/tree 共用基础集合，写后直接 DEL且不回填', async () => {
  await cache.invalidateBestEffort([adminKey])
  queries.length = 0
  const all = await service.adminList('flat')
  assert.equal(probe(), 1)
  queries.length = 0
  const tree = await service.adminList('tree')
  assert.ok(tree.length)
  assert.equal(probe(), 0)
  assert.ok(all.length >= tree.length)
  await create()
  assert.equal(await redis.get(adminKey), null)
  const node = await create()
  for (const change of [() => service.update(node.id, { name: '改名' }, '1'), () => service.setStatus(node.id, 0, '1'), () => service.setStatus(node.id, 1, '1'), () => service.update(node.id, { pid: all[0].id }, '1')]) {
    await service.adminList()
    await change()
    assert.equal(await redis.get(adminKey), null)
  }
})

test('显式缓存+anchor开关：真实 Redis MISS 一次SQL，HIT无SQL，关闭后不回填', async () => {
  const root = await create({ cacheEnabled: true })
  const branch = await create({ pid: root.id, cacheEnabled: true })
  const leaf = await create({ pid: branch.id, value: 'v1' })
  queries.length = 0
  assert.deepEqual(ids(await service.getCachedDescendants(root.id)), [branch.id, leaf.id])
  assert.equal(probe(), 1)
  queries.length = 0
  assert.deepEqual(ids(await service.getCachedDescendants(root.id, { includeSelf: true })), [root.id, branch.id, leaf.id])
  assert.equal((await service.getCachedDescendants(root.id, { format: 'tree' }))[0].children[0].id, leaf.id)
  assert.equal(probe(), 0)
  await service.getCachedChildren(branch.id)
  queries.length = 0
  assert.deepEqual(ids(await service.getCachedChildren(branch.id)), [leaf.id])
  assert.equal(probe(), 0)
  await service.update(leaf.id, { name: '新展示名称' }, '1')
  assert.equal(await redis.get(descendantsKey(root.id)), null)
  assert.equal((await service.getCachedDescendants(root.id)).at(-1).name, '新展示名称')
  await service.update(root.id, { cacheEnabled: false }, '1')
  queries.length = 0
  await service.getCachedDescendants(root.id)
  await service.getCachedDescendants(root.id)
  assert.equal(probe(), 2)
  assert.equal(await redis.get(descendantsKey(root.id)), null)
  await assert.rejects(source.transaction(manager => migration.down(manager.queryRunner)), /缓存配置/)
})

test('同树/跨根移动失效旧新祖先和子树业务锚点；停用祖先裁剪查询分支', async () => {
  const left = await create({ cacheEnabled: true })
  const right = await create({ cacheEnabled: true })
  const branch = await create({ pid: left.id, cacheEnabled: true })
  const leaf = await create({ pid: branch.id, cacheEnabled: true })
  const destination = await create({ pid: left.id, cacheEnabled: true })
  await service.getCachedDescendants(left.id)
  await service.getCachedDescendants(branch.id)
  await service.update(branch.id, { pid: destination.id }, '1')
  assert.equal(await redis.get(descendantsKey(left.id)), null)
  assert.equal(await redis.get(descendantsKey(branch.id)), null)
  await service.getCachedDescendants(left.id)
  await service.getCachedDescendants(right.id)
  await service.update(branch.id, { pid: right.id }, '1')
  assert.equal(await redis.get(descendantsKey(left.id)), null)
  assert.equal(await redis.get(descendantsKey(right.id)), null)
  assert.deepEqual(ids(await service.getChildren(right.id)), [branch.id])
  await service.getCachedDescendants(branch.id)
  await service.getCachedChildren(branch.id)
  await service.setStatus(right.id, 0, '1')
  assert.deepEqual(await service.getCachedDescendants(branch.id, { includeSelf: true }), [])
  assert.deepEqual(await service.getCachedChildren(branch.id), [])
  assert.equal((await service.detail(leaf.id)).effectiveStatus, 0)
  assert.deepEqual(ids(await service.getDescendants(right.id)), [branch.id, leaf.id])
  await service.setStatus(right.id, 1, '1')
  assert.deepEqual(ids(await service.getCachedDescendants(branch.id)), [leaf.id])
})

test('不修改稳定编码和已设置值，局部更新/null/false 正确且循环/重复被拒', async () => {
  const root = await create()
  const child = await create({ pid: root.id, value: '', remark: '原备注' })
  await assert.rejects(service.update(child.id, { code: 'new.code' }, '1'), /编码/)
  await assert.rejects(service.update(child.id, { value: 'changed' }, '1'), /业务值/)
  await service.update(child.id, { pid: null, remark: null, cacheEnabled: false }, '2')
  assert.equal((await service.detail(child.id)).value, '')
  const saved = await source.getRepository(SysDictEntity).findOneByOrFail({ id: child.id })
  assert.equal(saved.remark, null)
  assert.equal(saved.updatedBy, '2')
  await assert.rejects(create({ code: root.code }), /编码已存在/)
  await assert.rejects(create({ name: root.name }), /名称已存在/)
  await service.update(child.id, { pid: root.id }, '1')
  await assert.rejects(service.update(root.id, { pid: child.id }, '1'), /循环/)
  await assert.rejects(service.update(root.id, { pid: root.id }, '1'), /循环/)
})

test('并发互移仅一项成功，重复创建仅一项成功', async () => {
  const left = await create()
  const right = await create()
  const moves = await Promise.allSettled([service.update(left.id, { pid: right.id }, '1'), service.update(right.id, { pid: left.id }, '1')])
  assert.equal(moves.filter(result => result.status === 'fulfilled').length, 1)
  const same = input()
  const duplicates = await Promise.allSettled(Array.from({ length: 8 }, () => service.create(same, '1')))
  assert.equal(duplicates.filter(result => result.status === 'fulfilled').length, 1)
})

test('32层边界及移动子树高度保护；超限既有数据不静默截断', async () => {
  let root
  let parent
  for (let depth = 1; depth <= 32; depth++) {
    parent = await create({ pid: parent?.id })
    root ??= parent
  }
  assert.equal((await service.getDescendants(root.id)).length, 31)
  await assert.rejects(create({ pid: parent.id }), /32/)
  const subtree = await create()
  await create({ pid: subtree.id })
  await assert.rejects(service.update(subtree.id, { pid: parent.id }, '1'), /32/)
  await source.query(`INSERT INTO sys_dict(name,code,pid) VALUES ('越界','test.too_deep',$1)`, [parent.id])
  await assert.rejects(service.getDescendants(root.id), /32/)
  await assert.rejects(service.getChildren((await source.query(`SELECT id::text FROM sys_dict WHERE code='test.too_deep'`))[0].id), /32/)
})

test('10000节点结果上限保护，直接下级查询不加载无关子树', async () => {
  const root = await create()
  await source.query(`INSERT INTO sys_dict(name,code,pid) SELECT '大集合'||i,'large.node_'||i,$1::bigint FROM generate_series(1,10001) i`, [root.id])
  await assert.rejects(service.getDescendants(root.id), /10000/)
  await assert.rejects(service.getChildren(root.id), /10000/)
  const other = await create()
  queries.length = 0
  assert.deepEqual(await service.getChildren(other.id), [])
  assert.equal(probe(), 1)
})

test('1000节点性能样本记录查询次数、命中比例、响应大小、CPU与序列化时间', async () => {
  const root = await create({ cacheEnabled: true })
  await source.query(`INSERT INTO sys_dict(name,code,pid) SELECT '性能'||i,'perf.node_'||i,$1::bigint FROM generate_series(1,1000) i`, [root.id])
  const samples = []
  for (const [name, read] of [
    ['roots', () => service.roots()],
    ['children', () => service.getChildren(root.id)],
    ['descendants', () => service.getDescendants(root.id)],
    ['cached_miss', () => service.getCachedDescendants(root.id)],
    ['cached_hit', () => service.getCachedDescendants(root.id)],
  ]) {
    queries.length = 0
    const cpu = process.cpuUsage()
    const start = performance.now()
    const rows = await read()
    const elapsed = performance.now() - start
    const serializeStart = performance.now()
    const json = JSON.stringify(rows)
    const used = process.cpuUsage(cpu)
    samples.push({ name, nodes: rows.length, queries: probe(), elapsedMs: Number(elapsed.toFixed(2)), bytes: Buffer.byteLength(json), jsonMs: Number((performance.now() - serializeStart).toFixed(2)), cpuMs: Number(((used.user + used.system) / 1000).toFixed(2)) })
  }
  assert.deepEqual(samples.map(sample => sample.queries), [1, 1, 1, 1, 0])
  console.log('字典1000节点样本', JSON.stringify(samples), '重复缓存读取命中比例=1/2（冷启动一次MISS一次HIT）')
})

test('失效删除加载锁后，真实Redis正在进行的旧加载不得回填', async () => {
  const key = 'sys:dict:{1}:race'
  let entered
  let release
  const ready = new Promise((resolve) => {
    entered = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const pending = cache.getOrLoadBestEffort(key, async () => {
    entered()
    await gate
    return { value: 'old' }
  }, { ttl: 60 })
  await ready
  await cache.invalidateBestEffort([key])
  release()
  assert.deepEqual(await pending, { value: 'old' })
  assert.equal(await redis.get(key), null)
  assert.deepEqual(await cache.getOrLoadBestEffort(key, async () => ({ value: 'fresh' })), { value: 'fresh' })
})

test('Redis故障/慢响应回源并短超时，不影响数据库读取', async () => {
  const root = await create({ cacheEnabled: true })
  const slowCache = new CacheService({ getClient: () => ({ get: () => new Promise(() => {}) }) })
  slowCache.onModuleInit()
  const direct = new DictService(source.getRepository(SysDictEntity), slowCache)
  const start = Date.now()
  assert.deepEqual(await direct.getCachedChildren(root.id), [])
  assert.ok(Date.now() - start < 800)
  const failed = new CacheService({ getClient: () => {
    throw new Error('redis offline')
  } })
  failed.onModuleInit()
  const fallback = new DictService(source.getRepository(SysDictEntity), failed)
  assert.deepEqual(await fallback.getCachedDescendants(root.id), [])
  await fallback.update(root.id, { name: '故障仍写入' }, '1')
  assert.equal((await service.detail(root.id)).name, '故障仍写入')
})

test('setup补齐启停权限，不给普通用户管理授权，重复运行保持自定义元数据', async () => {
  await initializeBaseData(source)
  const [page] = await source.query(`SELECT id::text,component FROM sys_menu WHERE name='SystemDict'`)
  assert.equal(page.component, '/system/dict/list')
  assert.deepEqual((await source.query(`SELECT auth_code FROM sys_menu WHERE auth_code LIKE 'system:dict:%' ORDER BY auth_code`)).map(row => row.auth_code), ['system:dict:create', 'system:dict:disable', 'system:dict:list', 'system:dict:update'])
  await source.query(`UPDATE sys_menu SET meta='{"title":"自定义字典"}' WHERE id=$1`, [page.id])
  await initializeBaseData(source)
  assert.deepEqual((await source.query(`SELECT meta FROM sys_menu WHERE id=$1`, [page.id]))[0].meta, { title: '自定义字典' })
  assert.deepEqual(await source.query(`SELECT 1 FROM sys_role_menu rm JOIN sys_role r ON r.id=rm.role_id JOIN sys_menu m ON m.id=rm.menu_id WHERE r.code='user' AND m.auth_code LIKE 'system:dict:%'`), [])
})

test('真实HTTP/RBAC：登录不足以读全量，业务只能定点有效读取，启停独立权限与Swagger', async () => {
  class ManagementModule {}
  Module({ controllers: [DictController], providers: [{ provide: DictService, useValue: service }] })(ManagementModule)
  class RootModule {}
  Module({ imports: [ManagementModule, RouterModule.register([{ path: 'system', module: ManagementModule }])], controllers: [DictBusinessController], providers: [DictReadGuard, { provide: DictService, useValue: service }] })(RootModule)
  app = await NestFactory.create(RootModule, new FastifyAdapter(), { logger: false })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, errorHttpStatusCode: 422 }))
  const reflector = new Reflector()
  app.useGlobalGuards(new RbacGuard(reflector, { getEffectivePermissionsByUserId: async () => permissions }))
  app.useGlobalInterceptors(new TransformInterceptor(reflector))
  app.useGlobalFilters(new CatchEverythingFilter())
  app.getHttpAdapter().getInstance().addHook('onRequest', async (request) => {
    if (request.headers.authorization === 'Bearer dict-test')
      request.user = { uid: '1', roleCodes: [] }
  })
  await app.init()
  const request = (path, method = 'GET', payload, token = true) => app.inject({ method, url: `/api${path}`, headers: token ? { authorization: 'Bearer dict-test' } : {}, payload })
  assert.equal((await request('/system/dict/list', 'GET', undefined, false)).statusCode, 401)
  assert.equal((await request('/system/dict/list')).statusCode, 403)
  assert.equal((await request('/system/dict/roots')).statusCode, 403)
  const root = await create({ cacheEnabled: true })
  const child = await create({ pid: root.id })
  await service.setStatus(child.id, 0, '1')
  assert.equal((await request(`/dict/${root.id}/children`, 'GET', undefined, false)).statusCode, 401)
  assert.deepEqual((await request(`/dict/${root.id}/children`)).json().data, [])
  assert.deepEqual((await request(`/dict/${root.id}/descendants?enabledOnly=false`)).json().data, [])
  for (const path of ['/dict/list', '/dict/all', '/dict/batch']) assert.equal((await request(path)).statusCode, 404)
  assert.equal((await request(`/system/dict/${child.id}`, 'DELETE')).statusCode, 404)
  permissions = ['system:dict:list', 'system:dict:update']
  assert.equal((await request('/system/dict/list?format=flat')).statusCode, 200)
  assert.equal((await request(`/system/dict/${child.id}/status`, 'PUT', { status: 1 })).statusCode, 403)
  permissions.push('system:dict:disable')
  assert.equal((await request(`/system/dict/${child.id}/status`, 'PUT', { status: 1 })).statusCode, 200)
  assert.deepEqual(ids((await request(`/dict/${root.id}/children`)).json().data), [child.id])
  assert.equal((await request(`/system/dict/${child.id}`, 'PUT', { cacheEnabled: null })).statusCode, 422)
  assert.equal((await request(`/dict/${root.id}/descendants?includeSelf=yes`)).statusCode, 422)
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth(undefined, 'auth').build())
  assert.ok(document.paths['/api/system/dict/list'].get)
  assert.ok(document.paths['/api/system/dict/roots'].get)
  assert.ok(document.paths['/api/dict/{id}/children'].get)
  assert.ok(document.paths['/api/dict/{id}/descendants'].get)
  assert.equal(document.paths['/api/dict/list'], undefined)
  assert.equal(document.paths['/api/system/dict/{id}'].delete, undefined)
  assert.equal(document.components.schemas.DictResponseDto.properties.pathIds, undefined)
  assert.ok(document.components.schemas.CreateDictDto.properties.cacheEnabled)
  assert.equal(document.components.schemas.UpdateDictDto.properties.code, undefined)
})
