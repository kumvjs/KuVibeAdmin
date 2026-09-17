/* eslint-disable test/no-import-node-test -- 使用 Node 原生测试验证迁移 CLI 的 ESM 构建产物。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'

test('迁移配置正确处理默认与显式 schema', async () => {
  const originalEnv = process.env
  try {
    for (const [input, expected] of [[undefined, undefined], ['', undefined], ['   ', undefined], [' app_schema ', 'app_schema']]) {
      process.env = { ...originalEnv, NODE_ENV: 'database-config-test', TYPEORM_TYPE: 'postgres' }
      if (input === undefined)
        delete process.env.TYPEORM_SCHEMA
      else
        process.env.TYPEORM_SCHEMA = input
      const { default: source, dataSourceOptions } = await import(`../dist/src/config/database.config.js?schema=${encodeURIComponent(String(input))}`)
      assert.equal(dataSourceOptions.schema, expected)
      assert.equal(dataSourceOptions.extra.options, '-c timezone=UTC')
      assert.equal(source.driver.parseTableName('sys_user').schema, expected)
      assert.equal(source.isInitialized, false)
    }
  }
  finally {
    process.env = originalEnv
  }
})

test('菜单 JSONB 默认值与 PostgreSQL 读取结果一致', async () => {
  const source = new DataSource({ type: 'postgres', entities: ['dist/**/*.entity.js'] })
  await source.buildMetadatas()
  const column = source.entityMetadatas.find(entity => entity.tableName === 'sys_menu').findColumnWithPropertyName('meta')
  assert.equal(source.driver.defaultEqual(column, { default: '\'{}\'' }), true)
})
