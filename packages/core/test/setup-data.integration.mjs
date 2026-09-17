/* eslint-disable antfu/no-import-dist -- 验证构建后的初始化逻辑与隔离 PostgreSQL。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { SysDeptEntity } from '../dist/src/modules/system/dept/entities/dept.entity.js'
import { SysMenuEntity } from '../dist/src/modules/system/menu/entities/menu.entity.js'
import { MenuService } from '../dist/src/modules/system/menu/menu.service.js'
import SysRoleMenuEntity from '../dist/src/modules/system/role/entities/role-menu.entity.js'
import { SysRoleEntity } from '../dist/src/modules/system/role/entities/role.entity.js'
import SysUserRoleEntity from '../dist/src/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import { UserRoleService } from '../dist/src/modules/user/user-role/user-role.service.js'
import { initializeBaseData } from '../dist/src/scripts/setup-data.js'
import 'reflect-metadata'

test('基础数据完整、最小授权、可重复执行并保护已有数据', async () => {
  const url = new URL(process.env.SETUP_TEST_DATABASE_URL ?? '')
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
  assert.equal(url.pathname, '/setup_test')
  const database = `setup_${randomUUID().replaceAll('-', '')}`
  const admin = await new DataSource({ type: 'postgres', url: url.href }).initialize()
  const testUrl = new URL(url)
  testUrl.pathname = `/${database}`
  const source = new DataSource({ type: 'postgres', url: testUrl.href, entities: ['dist/src/**/*.entity.js'], synchronize: true })
  try {
    await admin.query(`CREATE DATABASE "${database}"`)
    await source.initialize()
    const result = await initializeBaseData(source)
    const menus = source.getRepository(SysMenuEntity)
    const roles = source.getRepository(SysRoleEntity)
    const links = source.getRepository(SysRoleMenuEntity)
    const userRoles = source.getRepository(SysUserRoleEntity)
    const ordinary = await roles.findOneByOrFail({ code: 'user' })
    assert.equal(ordinary.isDefault, true)
    assert.equal(await links.count(), 0)
    assert.equal(await menus.count(), 23)
    assert.equal((await menus.find()).filter(menu => menu.authCode).length, 21)
    const root = await source.getRepository(SysDeptEntity).findOneByOrFail({ id: result.rootDeptId })
    assert.equal(root.pid, null)
    const dept = await menus.findOneByOrFail({ name: 'SystemDept' })
    assert.equal(dept.component, '/system/dept/list')
    await menus.update(dept.id, { meta: { title: '我的部门', order: 42 } })
    const user = source.getRepository(SysUserEntity).create({ username: 'seed-test', name: '测试用户', status: 1, sessionVersion: 1 })
    await user.setPassword('Setup-test-password-2026')
    await source.getRepository(SysUserEntity).save(user)
    await userRoles.save({ userId: user.id, roleId: ordinary.id })
    const other = await roles.save({ code: 'custom-admin', name: '自定义管理员', status: 1, isDefault: false })
    const attachment = await menus.findOneByOrFail({ authCode: 'system:attachment:read' })
    const system = await menus.findOneByOrFail({ name: 'System' })
    const attachmentGroup = await menus.findOneByOrFail({ name: 'SystemAttachment' })
    assert.equal(attachmentGroup.pid, system.id)
    assert.equal(attachmentGroup.type, 'catalog')
    assert.equal(attachmentGroup.component, null)
    const attachmentPermissions = await menus.findBy({ pid: attachmentGroup.id })
    assert.deepEqual(attachmentPermissions.map(menu => menu.name).sort(), ['AttachmentDelete', 'AttachmentList', 'AttachmentRead', 'UploadPolicyRead', 'UploadPolicyWrite'])
    // 模拟旧版：恢复直接挂在 System 下的五项权限，随后原地升级。
    for (const permission of attachmentPermissions)
      await menus.update(permission.id, { pid: system.id })
    await menus.delete(attachmentGroup.id)
    const business = await menus.save({ name: 'BusinessRead', type: 'button', authCode: 'business:order:read', status: 1, meta: { title: '业务读取' } })
    await links.save([
      { roleId: ordinary.id, menuId: attachment.id },
      { roleId: ordinary.id, menuId: dept.id },
      { roleId: ordinary.id, menuId: business.id },
      { roleId: other.id, menuId: attachment.id },
    ])
    const repaired = await initializeBaseData(source)
    assert.deepEqual(repaired.affectedUserIds, [user.id])
    assert.equal(repaired.rootDeptId, root.id)
    const upgradedGroup = await menus.findOneByOrFail({ name: 'SystemAttachment' })
    for (const permission of attachmentPermissions) {
      const upgraded = await menus.findOneByOrFail({ id: permission.id })
      assert.equal(upgraded.pid, upgradedGroup.id)
      assert.deepEqual(upgraded.meta, permission.meta)
    }
    assert.equal(await menus.count(), 24)
    assert.equal(await source.getRepository(SysDeptEntity).count(), 1)
    assert.equal(await roles.count(), 2)
    assert.deepEqual((await links.findBy({ roleId: ordinary.id })).map(link => link.menuId), [business.id])
    assert.equal(await links.countBy({ roleId: other.id }), 1)
    assert.deepEqual((await menus.findOneByOrFail({ id: dept.id })).meta, { title: '我的部门', order: 42 })
    const runtime = new MenuService(menus, new UserRoleService(userRoles), {})
    assert.deepEqual(await runtime.getPermissionsByUserId(user.id), ['business:order:read'])
    assert.deepEqual(await runtime.getAllMenusByUserId(user.id), [])
    const superRole = await roles.save({ code: 'super', name: 'super', status: 1, isDefault: false })
    await userRoles.save({ userId: user.id, roleId: superRole.id })
    const routes = await runtime.getAllMenusByUserId(user.id)
    assert.deepEqual(routes[0].children.map(route => route.name), ['SystemMenu', 'SystemRole', 'SystemUser', 'SystemAttachment', 'SystemDept'])
    assert.equal(routes[0].children.length, 5)
    assert.ok((await runtime.getPermissionsByUserId(user.id)).includes('system:attachment:read'))
    await initializeBaseData(source)
    assert.equal(await menus.count(), 24)

    // 非旧版根目录归属不应被覆盖。
    await menus.update(attachment.id, { pid: dept.id })
    await assert.rejects(initializeBaseData(source), /初始化菜单冲突/)
    assert.equal((await menus.findOneByOrFail({ id: attachment.id })).pid, dept.id)
    await menus.update(attachment.id, { pid: upgradedGroup.id })

    // 提前发生的默认角色修复应随菜单冲突一起回滚。
    await roles.update(ordinary.id, { isDefault: false })
    await menus.update(dept.id, { status: 0 })
    await assert.rejects(initializeBaseData(source), /初始化菜单冲突/)
    assert.equal((await roles.findOneByOrFail({ id: ordinary.id })).isDefault, false)
    await menus.update(dept.id, { status: 1 })
    await roles.update(other.id, { isDefault: true })
    await assert.rejects(initializeBaseData(source), /已有其他默认角色/)
    await roles.update(other.id, { isDefault: false })
    await roles.softDelete(ordinary.id)
    await assert.rejects(initializeBaseData(source), /user 角色已停用或删除/)
  }
  finally {
    if (source.isInitialized)
      await source.destroy()
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`)
    await admin.destroy()
  }
})
