/* eslint-disable antfu/no-import-dist -- 使用真实 PostgreSQL 验证无限层级、并发关系与迁移保留。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Module, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector, RouterModule } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { DataSource } from 'typeorm'
import { CatchEverythingFilter } from '../dist/src/common/filters/catch-everything.filter.js'
import { TransformInterceptor } from '../dist/src/common/interceptors/transform.interceptor.js'
import { AddSystemDict1790771566235 } from '../dist/src/migrations/1790771566235-add-system-dict.js'
import { RbacGuard } from '../dist/src/modules/auth/guards/rbac.guard.js'
import { DictController } from '../dist/src/modules/system/dict/dict.controller.js'
import { DictService } from '../dist/src/modules/system/dict/dict.service.js'
import { SysDictEntity } from '../dist/src/modules/system/dict/entities/dict.entity.js'
import { initializeBaseData } from '../dist/src/scripts/setup-data.js'
import 'reflect-metadata'

// 只使用管理连接创建本次随机库；不迁移、清理或复用任何已有业务数据库。
const adminUrl = new URL(process.env.DICT_TEST_DATABASE_URL ?? '')
assert.equal(adminUrl.pathname, '/postgres')
assert.ok(['127.0.0.1', 'localhost'].includes(adminUrl.hostname))
const database = `kuvibe_dict_test_${randomUUID().replaceAll('-', '')}`
const url = new URL(adminUrl)
url.pathname = `/${database}`
const config = { type: 'postgres', url: url.href, synchronize: false, migrationsRun: false, entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], extra: { max: 16, options: '-c timezone=UTC' } }
let admin
let source
let service
let app
let sequence = 0
let permissions = []
const input = (fields = {}) => ({ name: `节点${++sequence}`, code: `test.node_${sequence}`, ...fields })
const create = fields => service.create(input(fields), '1')
const flat = (rootId, fields = {}) => service.list({ rootId, format: 'flat', ...fields })
const migration = new AddSystemDict1790771566235()

before(async () => {
  admin = await new DataSource({ type: 'postgres', url: adminUrl.href }).initialize()
  await admin.query(`CREATE DATABASE "${database}"`)
  source = await new DataSource(config).initialize()
  source.migrations = source.migrations.filter(item => item.name !== migration.name)
  await source.runMigrations()
  service = new DictService(source.getRepository(SysDictEntity))
})

after(async () => {
  await app?.close()
  if (source?.isInitialized)
    await source.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await admin.destroy()
  }
})

test('迁移只新增字典表，旧行/微秒/软删除保持，空表 up/down/up 后实体 diff 为空', async () => {
  await source.query(`INSERT INTO sys_user(username,name,password_hash,created_at,deleted_at) VALUES ('dict_old','历史用户','$argon2id$fixture','2020-01-01T00:00:00.123456Z','2021-01-01T00:00:00.654321Z')`)
  const snapshot = () => source.query(`SELECT id::text, username, name, tenant_id::text, extract(epoch FROM created_at)::text AS created, extract(epoch FROM deleted_at)::text AS deleted FROM sys_user ORDER BY id`)
  const original = await snapshot()
  await source.transaction(async (manager) => {
    for (const direction of ['up', 'down', 'up']) {
      await migration[direction](manager.queryRunner)
      assert.deepEqual(await manager.query(`SELECT id::text, username, name, tenant_id::text, extract(epoch FROM created_at)::text AS created, extract(epoch FROM deleted_at)::text AS deleted FROM sys_user ORDER BY id`), original)
    }
  })
  const metadata = await new DataSource({ ...config, entities: [SysDictEntity], migrations: [] }).initialize()
  try {
    assert.deepEqual((await metadata.driver.createSchemaBuilder().log()).upQueries.map(row => row.query), [])
  }
  finally { await metadata.destroy() }
  await source.query(`SELECT setval(pg_get_serial_sequence('sys_dict','id'), 9007199254740993, false)`)
})

test('根/中间/叶子按 ID 或编码查询全部层级，路径含自身且 ID 不丢精度', async () => {
  const root = await create({ name: '系统', order: 20 })
  const branch = await create({ name: '用户 / 状态', pid: root.id, value: 'category', order: 10 })
  const leaf = await create({ name: '启用', pid: branch.id, value: '' })
  const sibling = await create({ pid: root.id, order: 0 })
  assert.equal(root.id, '9007199254740993')
  assert.equal(branch.hasChildren, false)
  assert.equal((await service.detail(branch.id)).hasChildren, true)
  assert.deepEqual((await flat(root.id)).map(row => row.id), [sibling.id, branch.id, leaf.id])
  assert.deepEqual((await flat(branch.id)).map(row => row.id), [leaf.id])
  assert.deepEqual(await flat(leaf.id), [])
  const detail = await service.detail(leaf.id)
  assert.deepEqual(detail.pathIds, [root.id, branch.id, leaf.id])
  assert.deepEqual(detail.pathNames, ['系统', '用户 / 状态', '启用'])
  assert.equal(detail.fullPathId, `/${root.id}/${branch.id}/${leaf.id}/`)
  assert.equal(detail.fullPathName, '系统 / 用户 / 状态 / 启用')
  assert.equal(detail.value, '')
  assert.equal(detail.depth, 3)
  const codeRows = await service.list({ rootCode: branch.code, format: 'flat', includeSelf: true })
  assert.deepEqual(codeRows.map(row => row.id), [branch.id, leaf.id])
  const subtree = await service.list({ rootId: branch.id, includeSelf: true })
  assert.equal(subtree[0].children[0].fullPathId, detail.fullPathId)
  await assert.rejects(service.list({ rootId: root.id, rootCode: root.code }), /只能指定一个/)
  await assert.rejects(flat('9223372036854775808'), /bigint/)
  await assert.rejects(service.list({ rootCode: 'no.such.code' }), /不存在/)
})

test('改名和跨树移动立即更新所有后代路径，partial/null 保留或清空正确', async () => {
  const left = await create()
  const right = await create({ name: '新根' })
  const branch = await create({ pid: left.id, value: '原值', remark: '原备注' })
  const leaf = await create({ pid: branch.id })
  await service.update(branch.id, { name: '移动节点', pid: right.id }, '2')
  const moved = await service.detail(leaf.id)
  assert.deepEqual(moved.pathIds, [right.id, branch.id, leaf.id])
  assert.equal(moved.pathNames[1], '移动节点')
  assert.deepEqual(await flat(left.id), [])
  assert.equal((await service.detail(branch.id)).value, '原值')
  await service.update(branch.id, { pid: null, value: null, remark: null }, '2')
  assert.deepEqual((await service.detail(leaf.id)).pathIds, [branch.id, leaf.id])
  const saved = await source.getRepository(SysDictEntity).findOneByOrFail({ id: branch.id })
  assert.equal(saved.value, null)
  assert.equal(saved.remark, null)
  assert.equal(saved.updatedBy, '2')
  await assert.rejects(service.update(branch.id, { pid: leaf.id }, '1'), /循环/)
  await assert.rejects(service.update(branch.id, { pid: branch.id }, '1'), /循环/)
  await assert.rejects(create({ pid: '9223372036854775807' }), /父字典节点不存在/)
})

test('祖先停用裁剪整个分支，定点查子孙也不会绕过祖先状态', async () => {
  const root = await create({ status: 0 })
  const branch = await create({ pid: root.id, status: 1 })
  const leaf = await create({ pid: branch.id, status: 1 })
  assert.equal((await service.detail(leaf.id)).effectiveStatus, 0)
  assert.equal((await flat(root.id)).length, 2)
  assert.deepEqual(await flat(branch.id, { enabledOnly: true, includeSelf: true }), [])
  await service.update(root.id, { status: 1 }, '1')
  assert.equal((await flat(root.id, { enabledOnly: true })).length, 2)
  await service.update(branch.id, { status: 0 }, '1')
  assert.deepEqual(await flat(root.id, { enabledOnly: true }), [])
  assert.equal((await flat(root.id)).length, 2)
})

test('重复编码/同级名称、删除保护、软删除复用及有数据回滚保护', async () => {
  const root = await create()
  const child = await create({ pid: root.id, status: 0 })
  await assert.rejects(create({ name: root.name }), /同级字典名称已存在/)
  await assert.rejects(create({ code: root.code }), /编码已存在/)
  await assert.rejects(service.remove(root.id, '1'), /仍有下级/)
  await service.remove(child.id, '1')
  assert.equal((await service.detail(root.id)).hasChildren, false)
  await assert.rejects(service.detail(child.id), /不存在/)
  await assert.rejects(create({ pid: child.id }), /不存在/)
  await create({ pid: root.id, name: child.name, code: child.code })
  await assert.rejects(source.transaction(manager => migration.down(manager.queryRunner)), /已有数据/)
  assert.ok((await source.query(`SELECT count(*)::int AS count FROM sys_dict`))[0].count > 0)
})

test('并发互移最多一项成功，删除与新增竞态和重复创建不会破坏树', async () => {
  const left = await create()
  const right = await create()
  const moves = await Promise.allSettled([
    service.update(left.id, { pid: right.id }, '1'),
    service.update(right.id, { pid: left.id }, '1'),
  ])
  assert.equal(moves.filter(row => row.status === 'fulfilled').length, 1)
  assert.match(moves.find(row => row.status === 'rejected').reason.message, /循环/)
  assert.ok((await service.detail(left.id)).depth <= 2)
  assert.ok((await service.detail(right.id)).depth <= 2)
  const parent = await create()
  const race = await Promise.allSettled([service.remove(parent.id, '1'), create({ pid: parent.id })])
  assert.equal(race.filter(row => row.status === 'fulfilled').length, 1)
  const shared = input()
  const duplicates = await Promise.allSettled(Array.from({ length: 20 }, () => service.create(shared, '1')))
  assert.equal(duplicates.filter(row => row.status === 'fulfilled').length, 1)
  assert.ok(duplicates.filter(row => row.status === 'rejected').every(row => /编码已存在|名称已存在/.test(row.reason.message)))
})

test('真实 PostgreSQL 千层树定点查任意中间节点，flat 可序列化且完整根路径不丢失', async () => {
  await source.query(`INSERT INTO sys_dict(id,pid,name,code) SELECT 9007199254840993 + i, CASE WHEN i=1 THEN NULL ELSE 9007199254840993 + i-1 END, '层级' || i, 'deep.node_' || i FROM generate_series(1,1000) i`)
  const rows = await service.list({ rootCode: 'deep.node_500', includeSelf: true, format: 'flat' })
  assert.equal(rows.length, 501)
  assert.equal(rows[0].depth, 500)
  assert.equal(rows.at(-1).depth, 1000)
  assert.equal(rows.at(-1).pathIds.length, 1000)
  assert.equal(rows.at(-1).pathIds[0], '9007199254840994')
  assert.doesNotThrow(() => JSON.stringify(rows))
  await assert.rejects(service.update('9007199254840994', { pid: rows.at(-1).id }, '1'), /循环/)
})

test('初始化补齐字典菜单及权限、重复执行保持用户元数据且不给普通角色管理权限', async () => {
  await initializeBaseData(source)
  const [page] = await source.query(`SELECT id::text, component FROM sys_menu WHERE name='SystemDict'`)
  assert.equal(page.component, '/system/dict/list')
  const codes = await source.query(`SELECT auth_code FROM sys_menu WHERE auth_code LIKE 'system:dict:%' ORDER BY auth_code`)
  assert.deepEqual(codes.map(row => row.auth_code), ['system:dict:create', 'system:dict:delete', 'system:dict:list', 'system:dict:update'])
  await source.query(`UPDATE sys_menu SET meta='{"title":"我的字典"}' WHERE id=$1`, [page.id])
  await initializeBaseData(source)
  assert.deepEqual((await source.query(`SELECT meta FROM sys_menu WHERE id=$1`, [page.id]))[0].meta, { title: '我的字典' })
  assert.deepEqual(await source.query(`SELECT 1 FROM sys_role_menu rm JOIN sys_role r ON r.id=rm.role_id JOIN sys_menu m ON m.id=rm.menu_id WHERE r.code='user' AND m.auth_code LIKE 'system:dict:%'`), [])
})

test('真实 HTTP DTO/权限/响应和 Swagger：下级接口、false 布尔、不可伪造路径及非法输入', async () => {
  class HttpDictModule {}
  Module({ controllers: [DictController], providers: [{ provide: DictService, useValue: service }] })(HttpDictModule)
  class RootModule {}
  Module({ imports: [HttpDictModule, RouterModule.register([{ path: 'system', module: HttpDictModule }])] })(RootModule)
  app = await NestFactory.create(RootModule, new FastifyAdapter(), { logger: false })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, errorHttpStatusCode: 422 }))
  const reflector = new Reflector()
  app.useGlobalGuards(new RbacGuard(reflector, { getEffectivePermissionsByUserId: async () => permissions }))
  app.useGlobalInterceptors(new TransformInterceptor(reflector))
  app.useGlobalFilters(new CatchEverythingFilter())
  // 本用例隔离认证上下文，使用真实 RBAC 守卫检查权限；全量 Passport 在发布测试覆盖。
  app.getHttpAdapter().getInstance().addHook('onRequest', async (request) => {
    if (request.headers.authorization === 'Bearer dict-test')
      request.user = { uid: '1', roleCodes: [] }
  })
  await app.init()
  const request = (path, method = 'GET', payload, token = true) => app.inject({ method, url: `/api/system/dict${path}`, headers: token ? { authorization: 'Bearer dict-test' } : {}, payload })
  assert.equal((await request('/list', 'GET', undefined, false)).statusCode, 401)
  assert.equal((await request('/list')).statusCode, 403)
  permissions = ['system:dict:list']
  assert.equal((await request('', 'POST', input())).statusCode, 403)
  permissions.push('system:dict:create', 'system:dict:update', 'system:dict:delete')
  const response = await request('', 'POST', { ...input(), fullPathId: '/伪造/', fullPathName: '伪造' })
  assert.equal(response.statusCode, 201)
  const root = response.json().data
  assert.equal(root.fullPathId, `/${root.id}/`)
  const child = (await request('', 'POST', { ...input(), pid: root.id, status: 0 })).json().data
  const all = await request(`/${root.id}/descendants?enabledOnly=false`)
  assert.equal(all.statusCode, 200)
  assert.equal(all.json().success, true)
  assert.deepEqual(all.json().data.map(row => row.id), [child.id])
  assert.deepEqual((await request(`/${root.id}/descendants?enabledOnly=true`)).json().data, [])
  const tree = (await request(`/${root.id}/descendants?includeSelf=true&format=tree`)).json().data
  assert.equal(tree[0].children[0].id, child.id)
  assert.equal((await request('/list?includeSelf=yes')).statusCode, 422)
  assert.equal((await request('/list?rootId=1&rootCode=other')).statusCode, 422)
  assert.equal((await request('/9223372036854775808')).statusCode, 422)
  assert.equal((await request('', 'POST', { ...input(), order: -1 })).statusCode, 422)
  assert.equal((await request(`/${root.id}`, 'PUT', { status: null })).statusCode, 422)
  assert.equal((await request(`/${root.id}`, 'DELETE')).statusCode, 409)
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth(undefined, 'auth').build())
  assert.ok(document.paths['/api/system/dict/{id}/descendants'].get)
  assert.deepEqual(document.components.schemas.DictResponseDto.properties.pathIds.items, { type: 'string' })
  assert.equal(document.components.schemas.CreateDictDto.properties.fullPathId, undefined)
  assert.ok(document.paths['/api/system/dict'].post.responses['201'])
})
