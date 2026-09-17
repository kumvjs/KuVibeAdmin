import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

assert.ok(process.env.VBEN_TEST_SOURCE, '必须提供已执行 prepare-vben 的临时 Vben 目录')
const require = createRequire(resolve(process.env.VBEN_TEST_SOURCE, 'package.json'))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true })
const errors = []
const page = await browser.newPage()
page.on('pageerror', error => errors.push(error.message))
page.on('response', async response => {if (response.url().includes('/api/') && response.status() >= 400) console.log('HTTP ERROR', response.status(), response.url(), await response.text())})
page.on('console', msg => {if (msg.type() === 'error') console.log('BROWSER',msg.text())})
const base = 'http://localhost:5555'
async function login(username) {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('密码', { exact: true }).fill('Release-test-password-2026')
  const slider = await page.locator('[name="captcha-action"]').boundingBox()
  assert.ok(slider)
  await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(150)
  await page.mouse.move(slider.x + 450, slider.y + slider.height / 2, { steps: 25 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.getByText("验证通过", { exact: true }).waitFor()
  await page.locator('button').filter({ hasText: /^登录$/ }).click({ force: true })
  await page.waitForURL(url => !url.pathname.startsWith('/auth/'), { timeout: 30000 })
  if (!page.url().endsWith('/system/dept')) await page.goto(`${base}/system/dept`, { waitUntil: 'domcontentloaded' })
  await page.getByText('部门列表', { exact: true }).waitFor()
}
try {
  await login('release_admin')
  await page.locator('button').filter({ hasText: /新增部门/ }).waitFor({ state: 'visible' })
  console.log('PASS Vben 表单登录、后端动态菜单与按钮授权')
  const result = await page.evaluate(async () => {
    const { requestClient, useAccessStore, dept, role, user, menu } = await import('/src/release-e2e.ts')
    const access = useAccessStore()
    const before = access.accessToken
    access.setAccessToken('expired-release-test')
    const info = await requestClient.get('/user/info')
    if (!info.userId || !access.accessToken || access.accessToken === before || access.accessToken === 'expired-release-test') throw new Error('自动刷新未替换 Access Token')
    const suffix = String(Date.now())
    const deptName = `浏览器${suffix.slice(-8)}`
    await dept.createDept({ name: deptName, status: 1 })
    const deptRow = (await dept.getDeptList()).find(row => row.name === deptName)
    await dept.updateDept(deptRow.id, { remark: '浏览器修改' })
    const roleName = `Browser${suffix}`
    await role.createRole({ name: roleName, status: 1, permissions: [] })
    const roleRow = (await role.getRoleList({ page: 1, pageSize: 100 })).items.find(row => row.name === roleName)
    await role.updateRole(roleRow.id, { remark: '浏览器修改' })
    const username = `browser_${suffix}`
    await user.createUser({ username, name: username, password: 'Browser-password-2026', deptId: deptRow.id, roleIds: [roleRow.id], status: 1 })
    const userRow = (await user.getUserList({ page: 1, pageSize: 100 })).items.find(row => row.username === username)
    if (!userRow) throw new Error('用户创建或列表字段丢失')
    await user.updateUser(userRow.id, { remark: '浏览器修改' })
    const menuName = `Browser${suffix}`
    await menu.createMenu({ name: menuName, path: `/browser-${suffix}`, type: 'menu', component: '/system/dept/list', status: 1, meta: { title: '浏览器菜单' } })
    const menuRow = (await menu.getMenuList()).find(row => row.name === menuName)
    await menu.updateMenu(menuRow.id, { meta: { title: '修改后的菜单' } })
    await menu.deleteMenu(menuRow.id)
    const originalDept = (await dept.getDeptList()).find(row => row.name === '发布部门')
    await user.updateUser(userRow.id, { deptId: originalDept.id })
    await user.deleteUser(userRow.id)
    await role.deleteRole(roleRow.id)
    await dept.deleteDept(deptRow.id)
    return { userId: info.userId, refreshed: true }
  })
  assert.ok(BigInt(result.userId) > BigInt(Number.MAX_SAFE_INTEGER))
  console.log('PASS 401 自动刷新与 Cookie 轮换；Vben 四个系统模块 API 的创建、查询、更新、删除')
  for (const domain of ['role', 'user', 'menu']) {
    const response = page.waitForResponse(r => r.url().includes(`/api/system/${domain}/list`) && r.status() === 200)
    await page.goto(`${base}/system/${domain}`, { waitUntil: 'domcontentloaded' })
    await response
  }
  console.log('PASS 角色、用户、菜单页面调用真实列表接口')
  await page.evaluate(async () => { const { useAuthStore } = await import('/src/release-e2e.ts'); await useAuthStore().logout() })
  await page.waitForURL('**/auth/login**')
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/release-e2e.ts')
    await useAuthStore().authLogin({ username: 'release_member', password: 'Release-test-password-2026' })
  })
  await page.goto(`${base}/system/dept`, { waitUntil: 'domcontentloaded' })
  await page.getByText('部门列表', { exact: true }).waitFor()
  assert.equal(await page.locator('button').filter({ hasText: /新增部门/ }).count(), 0)
  const forbidden = page.waitForResponse(response => response.url().endsWith('/api/system/dept') && response.status() === 403)
  const denied = await page.evaluate(async () => {
    const { requestClient } = await import('/src/release-e2e.ts')
    try { await requestClient.post('/system/dept', { name: '越权创建', status: 1 }); return false }
    catch { return true }
  })
  assert.equal(denied, true)
  assert.equal((await forbidden).status(), 403)
  console.log('PASS 普通用户按钮隐藏与后端 403，退出和再次登录')
  assert.deepEqual(errors, [])
  console.log('Vben browser acceptance passed')
}
finally { await browser.close() }
