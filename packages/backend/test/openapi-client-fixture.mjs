/* eslint-disable antfu/no-top-level-await, antfu/no-import-dist -- 仅生成客户端验收使用的真实控制器契约，不连接数据库或执行业务方法。 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { setupSwagger } from '../dist/src/common/setup/setup-swagger.js'

// 依赖桩只用于元数据扫描，禁止将此应用作为 HTTP 业务服务启动。
const files = await readdir('dist/src/modules', { recursive: true })
const controllers = []
for (const file of files.filter(file => file.endsWith('.controller.js'))) {
  const exports = await import(pathToFileURL(resolve('dist/src/modules', file)).href)
  controllers.push(...Object.values(exports).filter(value => typeof value === 'function' && Reflect.hasMetadata('path', value)))
}
// SystemModule 对这些控制器所在模块追加 /system；其余控制器自带完整路径。
const systemNames = new Set(['DeptController', 'DictController', 'RoleController', 'SysUserController'])
class SystemFixtureModule {}
Module({ controllers: controllers.filter(controller => systemNames.has(controller.name)) })(SystemFixtureModule)
const module = await Test.createTestingModule({
  controllers: controllers.filter(controller => !systemNames.has(controller.name)),
  imports: [SystemFixtureModule, RouterModule.register([{ path: 'system', module: SystemFixtureModule }])],
}).useMocker(() => ({})).compile()
const app = module.createNestApplication(new FastifyAdapter(), { logger: false })
try {
  app.setGlobalPrefix('api')
  setupSwagger(app, { get: key => key === 'app'
    ? { name: 'KuVibeAdmin', globalPrefix: 'api' }
    : { enable: true, path: 'api-docs', serverUrl: 'http://localhost:7001' } })
  const document = JSON.parse(readFileSync('openapi/openapi.json', 'utf8'))
  for (const path of ['/system/user/list', '/system/dept/list', '/system/dict/list', '/system/dict/{id}/descendants', '/system/role/list', '/user/info', '/auth/login'])
    assert.ok(document.paths[path], path)
  console.log(`已从 ${controllers.length} 个真实控制器生成测试契约（非运行实例导出）`)
}
finally {
  await app.close()
}
