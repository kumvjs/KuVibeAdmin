/* eslint-disable test/no-import-node-test -- 验证 ESM 构建产物与真实静态服务。 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import FastifyStatic from '@fastify/static'
import Fastify from 'fastify'
// eslint-disable-next-line antfu/no-import-dist -- 验证实际构建输出。
import { prepareStaticRoot } from '../dist/src/static-assets.js'

test('三种入口固定 public，构建覆盖保留资源，启动后新增文件可访问', async () => {
  const application = await mkdtemp(path.join(os.tmpdir(), 'static-assets-'))
  const app = Fastify()
  try {
    const expected = path.join(application, 'public')
    for (const layout of ['src', 'dist', 'dist/src'])
      assert.equal(await prepareStaticRoot(path.join(application, layout)), expected)
    await mkdir(path.join(application, 'dist/public'), { recursive: true })
    assert.equal(await prepareStaticRoot(path.join(application, 'dist/src')), expected)
    app.register(FastifyStatic, {
      root: expected,
      allowedPath: pathname => !/^\/?uploads(?:\/|$)/.test(pathname),
    })
    await app.ready()
    await writeFile(path.join(expected, 'asset.txt'), 'persistent')
    await rm(path.join(application, 'dist'), { recursive: true })
    const response = await app.inject('/asset.txt')
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, 'persistent')
    await mkdir(path.join(expected, 'uploads'))
    await writeFile(path.join(expected, 'uploads/private.txt'), 'private')
    assert.equal((await app.inject('/uploads/private.txt')).statusCode, 404)
  }
  finally {
    await app.close()
    await rm(application, { recursive: true, force: true })
  }
})
