import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = resolve(process.env.VBEN_TEST_SOURCE || process.argv[2] || '')
assert.ok(process.env.VBEN_TEST_SOURCE || process.argv[2], '提供临时 Vben 源码目录')
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), '63a38dce49ba109f61607994e21ba921d8e970e9')
function replace(file, before, after) {
  const path = join(source, file)
  const text = readFileSync(path, 'utf8')
  if (text.includes(after)) return
  assert.ok(text.includes(before), `上游适配位置不匹配：${file}`)
  writeFileSync(path, text.replace(before, after))
}
replace('playground/.env.development', 'VITE_NITRO_MOCK=true', 'VITE_NITRO_MOCK=false')
replace('playground/vite.config.ts', 'http://localhost:5320/api', 'http://127.0.0.1:57018/api')
replace('playground/src/preferences.ts', 'app: {', 'app: {\n    accessMode: "backend",\n    enableRefreshToken: true,')
replace('playground/src/api/request.ts', 'const newToken = resp.data;', 'const newToken = (resp.data as any).data.accessToken;')
replace('playground/src/api/core/auth.ts', "return baseRequestClient.post('/auth/logout'", "return requestClient.post('/auth/logout'")
// 上游演示页未绑定按钮权限；联调样例使用后端实际权限码。
replace('playground/src/views/system/dept/list.vue', '<Button type="primary" @click="onCreate">', '<Button v-access:code="[\'system:dept:create\']" type="primary" @click="onCreate">')
// 仅用于临时联调，不进入任何部署产物。
writeFileSync(join(source, 'playground/src/release-e2e.ts'), `export { useAccessStore } from '@vben/stores';\nexport { requestClient } from './api/request';\nexport * as dept from './api/system/dept';\nexport * as role from './api/system/role';\nexport * as user from './api/system/user';\nexport * as menu from './api/system/menu';\nexport { useAuthStore } from './store';\n`)
console.log('Vben v5.7.0 临时联调适配完成；原始契约检查请使用未修改的独立检出。')
