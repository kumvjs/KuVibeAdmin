/* eslint-disable antfu/no-top-level-await, antfu/no-import-dist -- 验证构建后的真实应用、Passport、PostgreSQL 与 Redis。 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { DataSource } from 'typeorm'
import { SysRoleEntity } from '../dist/src/modules/system/role/entities/role.entity.js'
import SysUserRoleEntity from '../dist/src/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import 'reflect-metadata'

// 管理连接只能指向专用测试库；每次创建独立数据库，finally 只删除本次创建的库。
const url = new URL(process.env.RELEASE_TEST_DATABASE_URL ?? '')
const redisUrl = new URL(process.env.RELEASE_TEST_REDIS_URL ?? '')
assert.equal(url.pathname, '/m8_test')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
assert.ok(['localhost', '127.0.0.1'].includes(redisUrl.hostname))
const database = `m8_${randomUUID().replaceAll('-', '')}`
const admin = await new DataSource({
  type: 'postgres',
  url: url.href,
}).initialize()
const testUrl = new URL(url)
testUrl.pathname = `/${database}`
const source = new DataSource({
  type: 'postgres',
  url: testUrl.href,
  entities: ['dist/src/**/*.entity.js'],
  migrations: ['dist/src/migrations/*.js'],
  synchronize: false,
  extra: { options: '-c timezone=UTC' },
})
const port = Number(process.env.RELEASE_TEST_PORT || 57018)
const origin = `http://127.0.0.1:${port}`
const password = 'Release-test-password-2026'
const adminId = String(9007199254740993n + BigInt(Date.now()) * 1000n)
let child
let output = ''
let count = 0
async function check(name, run) {
  await run()
  console.log(`PASS ${++count}: ${name}`)
}
async function request(
  path,
  { token, cookie, method = 'GET', body, headers = {} } = {},
) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    rawCookie: response.headers.get('set-cookie'),
  }
}
function ok(result) {
  assert.ok(result.status < 300, JSON.stringify(result))
  assert.equal(result.body.code, 0, JSON.stringify(result))
  return result.body.data
}
async function login(username) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  return {
    token: ok(result).accessToken,
    cookie: result.cookie,
    rawCookie: result.rawCookie,
  }
}
try {
  await admin.query(`CREATE DATABASE "${database}"`)
  await source.initialize()
  await check('全部迁移 up/down/up 与实体零差异', async () => {
    const migrations = await source.runMigrations()
    assert.ok(migrations.length >= 4)
    for (let index = 0; index < migrations.length; index++)
      await source.undoLastMigration()
    await source.runMigrations()
    const diff = await source.driver.createSchemaBuilder().log()
    assert.deepEqual(
      diff.upQueries.map(q => q.query),
      [],
    )
  })
  await check('PostgreSQL 外键、唯一约束与实际事务回滚', async () => {
    await assert.rejects(source.query('INSERT INTO sys_user_role (user_id, role_id) VALUES (9223372036854775806, 9223372036854775807)'), error => error.code === '23503')
    await assert.rejects(source.transaction(async (manager) => {
      await manager.query('INSERT INTO sys_role (name, code) VALUES (\'回滚角色\', \'rollback-test\')')
      await manager.query('INSERT INTO sys_role (name, code) VALUES (\'冲突角色\', \'rollback-test\')')
    }), error => error.code === '23505')
    assert.equal((await source.query('SELECT count(*)::integer AS count FROM sys_role WHERE code = \'rollback-test\''))[0].count, 0)
  })
  // 超出 JS 安全整数范围的真实主键，确保所有 HTTP 边界保持字符串。
  const users = source.getRepository(SysUserEntity)
  const superRole = await source
    .getRepository(SysRoleEntity)
    .save({ name: '超级管理员', code: 'super', status: 1 })
  await source.query('SELECT setval(\'sys_user_id_seq\', $1, false)', [adminId])
  const superUser = users.create({
    id: adminId,
    username: 'release_admin',
    name: '发布管理员',
    status: 1,
    homePath: '/system/dept',
  })
  await superUser.setPassword(password)
  await users.save(superUser)
  await source
    .getRepository(SysUserRoleEntity)
    .save({ userId: superUser.id, roleId: superRole.id })
  child = spawn(process.execPath, ['dist/src/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: process.env.RELEASE_TEST_BROWSER_HOLD === 'true' ? 'test' : 'production',
      APP_NAME: 'KuVibeAdmin',
      APP_PORT: String(port),
      APP_BASE_URL: process.env.RELEASE_TEST_BROWSER_HOLD === 'true' ? origin : 'https://api.release.example',
      APP_CORS_ORIGINS: process.env.RELEASE_TEST_BROWSER_HOLD === 'true' ? 'http://localhost:5555,http://localhost:5999' : 'https://release.example',
      TYPEORM_TYPE: 'postgres',
      TYPEORM_HOST: url.hostname,
      TYPEORM_PORT: url.port,
      TYPEORM_USERNAME: decodeURIComponent(url.username),
      TYPEORM_PASSWORD: decodeURIComponent(url.password),
      TYPEORM_DATABASE: database,
      TYPEORM_SCHEMA: 'public',
      TYPEORM_SYNCHRONIZE: 'false',
      REDIS_HOST: redisUrl.hostname,
      REDIS_PORT: redisUrl.port,
      REDIS_PASSWORD: decodeURIComponent(redisUrl.password),
      REDIS_DB: '0',
      JWT_SECRET: randomUUID(),
      REFRESH_TOKEN_SECRET: randomUUID(),
      JWT_EXPIRE: '3600',
      REFRESH_TOKEN_EXPIRE: '86400',
      SWAGGER_ENABLE: 'true',
      SWAGGER_PATH: 'api-docs',
      DB_LOGGING: '[]',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (data) => {
    output += data
  })
  child.stderr.on('data', (data) => {
    output += data
  })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`应用启动失败：${output.slice(-6000)}`)
    try {
      if ((await fetch(`${origin}/api/timezone/getTimezoneOptions`)).ok) {
        ready = true
        break
      }
    }
    catch {}
    await delay(250)
  }
  assert.ok(ready, output.slice(-6000))
  let root, member, deptId, roleId, memberId, menuId, buttonId
  await check('真实登录、Cookie、Passport 与 bigint 边界', async () => {
    assert.equal((await request('/user/info')).status, 401)
    root = await login('release_admin')
    assert.match(root.rawCookie, /HttpOnly/i)
    assert.match(root.rawCookie, /Path=\/api\/auth/)
    const info = ok(await request('/user/info', root))
    assert.equal(info.userId, adminId)
    assert.equal(info.passwordHash, undefined)
    assert.ok(info.roles.includes('super'))
  })
  const write = async (path, body, method = 'POST', auth = root) =>
    request(path, { ...auth, method, body })
  await check('部门 CRUD、并发唯一性、树循环与软删除', async () => {
    ok(await write('/system/dept', { name: '发布部门', status: 1 }))
    deptId = ok(await request('/system/dept/list', root)).find(
      d => d.name === '发布部门',
    ).id
    const results = await Promise.all(
      [0, 1].map(() =>
        write('/system/dept', { name: '并发部门', status: 1, pid: deptId }),
      ),
    )
    assert.equal(results.filter(r => r.body.code === 0).length, 1)
    const childDept = ok(await request('/system/dept/list', root)).find(
      d => d.id === deptId,
    ).children[0]
    assert.ok(
      (await write(`/system/dept/${deptId}`, { pid: childDept.id }, 'PUT'))
        .status >= 400,
    )
    assert.ok(
      (await write(`/system/dept/${deptId}`, null, 'DELETE')).status >= 400,
    )
    ok(await write(`/system/dept/${childDept.id}`, null, 'DELETE'))
    assert.ok(
      (
        await source.query('SELECT deleted_at FROM sys_dept WHERE id=$1', [
          childDept.id,
        ])
      )[0].deleted_at,
    )
  })
  await check('菜单与按钮、角色授权、用户创建和事务回滚', async () => {
    ok(
      await write('/system/menu', {
        name: 'ReleaseDept',
        path: '/system/dept',
        component: '/system/dept/list',
        type: 'menu',
        status: 1,
        meta: { title: '部门管理' },
      }),
    )
    menuId = (
      await source.query('SELECT id FROM sys_menu WHERE name=$1', [
        'ReleaseDept',
      ])
    )[0].id
    ok(
      await write('/system/menu', {
        name: 'ReleaseDeptList',
        pid: menuId,
        type: 'button',
        authCode: 'system:dept:list',
        status: 1,
        meta: { title: '查询部门' },
      }),
    )
    buttonId = (
      await source.query('SELECT id FROM sys_menu WHERE name=$1', [
        'ReleaseDeptList',
      ])
    )[0].id
    ok(
      await write('/system/role', {
        name: '发布角色',
        code: 'release-member',
        status: 1,
        permissions: [menuId, buttonId],
      }),
    )
    roleId = ok(
      await request('/system/role/list?page=1&pageSize=20', root),
    ).items.find(r => r.code === 'release-member').id
    assert.ok(
      (
        await write(
          `/system/role/${roleId}`,
          { name: '不应保存', permissions: ['9223372036854775807'] },
          'PUT',
        )
      ).status >= 400,
    )
    assert.equal(
      (await source.query('SELECT name FROM sys_role WHERE id=$1', [roleId]))[0]
        .name,
      '发布角色',
    )
    ok(
      await write('/system/user', {
        username: 'release_member',
        name: '发布成员',
        password,
        deptId,
        roleIds: [roleId],
        status: 1,
      }),
    )
    memberId = (
      await source.query('SELECT id FROM sys_user WHERE username=$1', [
        'release_member',
      ])
    )[0].id
    member = await login('release_member')
    assert.deepEqual(ok(await request('/auth/codes', member)), [
      'system:dept:list',
    ])
    assert.equal(ok(await request('/menu/all', member))[0].name, 'ReleaseDept')
    ok(await request('/system/dept/list', member))
    assert.equal((await request('/system/user/list', member)).status, 403)
    assert.ok(
      (await write(`/system/dept/${deptId}`, null, 'DELETE')).status >= 400,
    )
    assert.ok(
      (await write(`/system/role/${roleId}`, null, 'DELETE')).status >= 400,
    )
  })
  await check('菜单/角色/用户变更实际失效 Redis 权限缓存', async () => {
    ok(await write(`/system/menu/${buttonId}`, { status: 0 }, 'PUT'))
    assert.deepEqual(ok(await request('/auth/codes', member)), [])
    assert.equal((await request('/system/dept/list', member)).status, 403)
    ok(await write(`/system/menu/${buttonId}`, { status: 1 }, 'PUT'))
    ok(await request('/system/dept/list', member))
    ok(await write(`/system/role/${roleId}`, { permissions: [] }, 'PUT'))
    assert.deepEqual(ok(await request('/auth/codes', member)), [])
    assert.deepEqual(ok(await request('/menu/all', member)), [])
    ok(
      await write(
        `/system/role/${roleId}`,
        { permissions: [menuId, buttonId] },
        'PUT',
      ),
    )
    ok(await request('/system/dept/list', member))
    ok(
      await write('/system/role', {
        name: '无权限角色',
        code: 'release-empty',
        status: 1,
        permissions: [],
      }),
    )
    const emptyRoleId = (
      await source.query('SELECT id FROM sys_role WHERE code=$1', [
        'release-empty',
      ])
    )[0].id
    ok(
      await write(
        `/system/user/${memberId}`,
        { roleIds: [emptyRoleId] },
        'PUT',
      ),
    )
    assert.equal((await request('/system/dept/list', member)).status, 403)
    ok(await write(`/system/user/${memberId}`, { roleIds: [roleId] }, 'PUT'))
    ok(await request('/system/dept/list', member))
  })
  await check('时区持久化、用户隔离与 DTO 校验', async () => {
    ok(
      await write(
        '/timezone/setTimezone',
        { timezone: 'Asia/Shanghai' },
        'POST',
        member,
      ),
    )
    assert.equal(
      ok(await request('/timezone/getTimezone', member)),
      'Asia/Shanghai',
    )
    assert.equal(ok(await request('/timezone/getTimezone', root)), null)
    assert.equal(
      (
        await write(
          '/timezone/setTimezone',
          { timezone: 'invalid-zone' },
          'POST',
          member,
        )
      ).status,
      422,
    )
    ok(
      await write('/timezone/setTimezone', { timezone: null }, 'POST', member),
    )
  })
  await check('刷新轮换、并发重放拒绝和 Origin 检查', async () => {
    const refreshed = await Promise.all(
      [0, 1].map(() =>
        request('/auth/refresh', { method: 'POST', cookie: member.cookie }),
      ),
    )
    assert.equal(refreshed.filter(r => r.status < 300).length, 1)
    assert.equal(refreshed.filter(r => r.status === 401).length, 1)
    const result = refreshed.find(r => r.status < 300)
    member = { token: ok(result).accessToken, cookie: result.cookie }
    assert.equal(
      (
        await write('/timezone/setTimezone', { timezone: 'UTC' }, 'POST', {
          ...member,
          headers: { origin: 'https://untrusted.example' },
        })
      ).status,
      403,
    )
  })
  await check('密码重置与停用撤销会话、最后管理员保护', async () => {
    ok(
      await write(
        `/system/user/${memberId}`,
        { password: 'Another-release-password' },
        'PUT',
      ),
    )
    assert.equal((await request('/user/info', member)).status, 401)
    assert.equal(
      (
        await request('/auth/refresh', {
          method: 'POST',
          cookie: member.cookie,
        })
      ).status,
      401,
    )
    ok(await write(`/system/user/${memberId}`, { password }, 'PUT'))
    member = await login('release_member')
    ok(await write(`/system/user/${memberId}`, { status: 0 }, 'PUT'))
    assert.equal((await request('/user/info', member)).status, 401)
    assert.ok(
      (await write(`/system/user/${superUser.id}`, { status: 0 }, 'PUT'))
        .status >= 400,
    )
    ok(await write(`/system/user/${memberId}`, { status: 1 }, 'PUT'))
  })
  await check('OpenAPI 与生产入口实际端点一致', async () => {
    const document = await (await fetch(`${origin}/api-docs/json`)).json()
    for (const path of [
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/codes',
      '/user/info',
      '/menu/all',
      '/system/dept/list',
      '/system/role/list',
      '/system/user/list',
      '/system/menu/list',
      '/timezone/getTimezone',
      '/upload',
    ])
      assert.ok(document.paths[path], path)
    for (const path of ['/auth/login', '/auth/refresh', '/auth/logout', '/system/user', '/system/role', '/system/dept', '/system/menu']) {
      assert.ok(document.paths[path].post.responses['201'].content['application/json'].schema, path)
    }
    assert.ok(document.paths['/upload'].post.responses['200'].content['application/json'].schema)
    await writeFile(
      process.env.RELEASE_TEST_OPENAPI
      || join(tmpdir(), 'kuvibeadmin-openapi.json'),
      JSON.stringify(document),
    )
  })
  await check('退出登录清除 Cookie 并拒绝 Access/Refresh 重用', async () => {
    member = await login('release_member')
    const result = await request('/auth/logout', { ...member, method: 'POST' })
    ok(result)
    assert.match(result.rawCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i)
    assert.equal((await request('/user/info', member)).status, 401)
    assert.equal(
      (
        await request('/auth/refresh', {
          method: 'POST',
          cookie: member.cookie,
        })
      ).status,
      401,
    )
  })
  if (process.env.RELEASE_TEST_BROWSER_HOLD === 'true') {
    for (const [name, path] of [
      ['ReleaseRole', 'role'],
      ['ReleaseUser', 'user'],
      ['ReleaseMenu', 'menu'],
    ]) {
      ok(
        await write('/system/menu', {
          name,
          path: `/system/${path}`,
          component: `/system/${path}/list`,
          type: 'menu',
          status: 1,
          meta: { title: path },
        }),
      )
    }
    ok(
      await write('/system/menu', {
        name: 'ReleaseDeptCreate',
        pid: menuId,
        type: 'button',
        authCode: 'system:dept:create',
        status: 1,
        meta: { title: '创建部门' },
      }),
    )
    console.log(`BROWSER_READY ${origin} release_admin / ${password}`)
    await new Promise((resolve) => {
      process.once('SIGTERM', resolve)
      process.once('SIGINT', resolve)
    })
  }
  else {
    await check('用户软删除与用户名复用', async () => {
      ok(await write(`/system/user/${memberId}`, null, 'DELETE'))
      assert.ok(
        (
          await source.query('SELECT deleted_at FROM sys_user WHERE id=$1', [
            memberId,
          ])
        )[0].deleted_at,
      )
      ok(
        await write('/system/user', {
          username: 'release_member',
          name: '新成员',
          password,
          deptId,
          roleIds: [roleId],
          status: 1,
        }),
      )
    })
  }
  console.log(`Release integration: ${count} checks passed`)
}
catch (error) {
  console.error(output.slice(-6000))
  throw error
}
finally {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await exited
  }
  if (source.isInitialized)
    await source.destroy()
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  await admin.destroy()
  // 不清空 Redis，测试使用专用容器；重用时通过不同超管 ID/测试库隔离之外仍需专用 Redis。
}
