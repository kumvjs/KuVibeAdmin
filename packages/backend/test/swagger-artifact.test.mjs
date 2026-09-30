/* eslint-disable antfu/no-import-dist, test/no-import-node-test -- 验证实际构建产物，无数据库连接。 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { setupSwagger } from '../dist/src/common/setup/setup-swagger.js'

class EmptyModule {}
Module({})(EmptyModule)

test('Swagger 开关控制导出，磁盘与 HTTP 契约一致，关闭保留已有快照', async () => {
  const originalCwd = process.cwd()
  const directory = mkdtempSync(join(tmpdir(), 'kuvibe-swagger-'))
  let app
  const config = enable => ({ get: key => key === 'app'
    ? { name: 'KuVibeAdmin', globalPrefix: 'api' }
    : { enable, path: 'api-docs', serverUrl: 'http://localhost:7001' } })
  try {
    process.chdir(directory)
    app = await NestFactory.create(EmptyModule, new FastifyAdapter(), { logger: false })
    setupSwagger(app, config(false))
    assert.throws(() => readFileSync('openapi/openapi.json'), { code: 'ENOENT' })
    setupSwagger(app, config(true))
    const artifact = readFileSync('openapi/openapi.json', 'utf8')
    await app.init()
    const response = await app.inject({ method: 'GET', url: '/api-docs/json' })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(JSON.parse(artifact), response.json())
    await app.close()
    app = await NestFactory.create(EmptyModule, new FastifyAdapter(), { logger: false })
    setupSwagger(app, config(false))
    await app.init()
    assert.equal((await app.inject({ method: 'GET', url: '/api-docs/json' })).statusCode, 404)
    assert.equal(readFileSync('openapi/openapi.json', 'utf8'), artifact)
  }
  finally {
    await app?.close()
    process.chdir(originalCwd)
    rmSync(directory, { recursive: true, force: true })
  }
})
