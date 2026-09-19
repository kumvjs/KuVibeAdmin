/* eslint-disable antfu/no-import-dist, antfu/no-top-level-await -- This integration entrypoint deliberately tests the built ESM application. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { crc32 } from 'node:zlib'
import multipart from '@fastify/multipart'
import { Global, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import Redis from 'ioredis'
import sharp from 'sharp'
import { DataSource } from 'typeorm'
import { CatchEverythingFilter } from '../dist/src/common/filters/catch-everything.filter.js'
import { TransformInterceptor } from '../dist/src/common/interceptors/transform.interceptor.js'
import { APP_CONFIG } from '../dist/src/config/app.config.js'
import { PUBLIC_KEY } from '../dist/src/modules/auth/auth.constant.js'
import { RbacGuard } from '../dist/src/modules/auth/guards/rbac.guard.js'
import { releaseUserAvatarReferences } from '../dist/src/modules/upload/attachment-reference.lifecycle.js'
import { AttachmentService } from '../dist/src/modules/upload/attachment.service.js'
import { AttachmentAuditEntity } from '../dist/src/modules/upload/entities/attachment-audit.entity.js'
import { AttachmentReferenceEntity } from '../dist/src/modules/upload/entities/attachment-reference.entity.js'
import { AttachmentEntity } from '../dist/src/modules/upload/entities/attachment.entity.js'
import { LocalUploadStorage, UPLOAD_STORAGE_ROOT } from '../dist/src/modules/upload/local-upload.storage.js'
import { UploadPolicyCacheService } from '../dist/src/modules/upload/upload-policy-cache.service.js'
import { UploadModule } from '../dist/src/modules/upload/upload.module.js'
import { SysUserEntity } from '../dist/src/modules/user/entities/user.entity.js'
import { CacheService } from '../dist/src/shared/cache/cache.service.js'
import { uploadKeys } from '../dist/src/shared/cache/keys/upload.keys.js'
// Run after `nest build`, against disposable local PostgreSQL/Redis only.
import 'reflect-metadata'

const dbUrl = new URL(process.env.UPLOAD_TEST_DATABASE_URL ?? '')
const redisUrl = new URL(process.env.UPLOAD_TEST_REDIS_URL ?? '')
assert.equal(dbUrl.pathname, '/m71_test', 'Only the disposable m71_test database is permitted')
assert.ok(['127.0.0.1', 'localhost'].includes(dbUrl.hostname))
assert.ok(['127.0.0.1', 'localhost'].includes(redisUrl.hostname))
const schema = `m71_${randomUUID().replaceAll('-', '')}`
const root = await realpath(await mkdtemp(join(tmpdir(), 'm71-integration-')))
const queries = []
const source = new DataSource({
  type: 'postgres',
  url: dbUrl.toString(),
  schema,
  entities: [resolve('dist/src/**/*.entity.js')],
  synchronize: false,
  logger: { logQuery: query => queries.push(query), logQueryError() {}, logQuerySlow() {}, logSchemaBuild() {}, logMigration() {}, log() {} },
  logging: ['query'],
})
const redis = new Redis(redisUrl.toString(), { keyPrefix: `${schema}:`, maxRetriesPerRequest: 1 })
let app
let completed = 0
async function check(name, run) {
  await run()
  completed++
  console.log(`PASS ${name}`)
}

function zipFixture(entries) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const filename = Buffer.from(name)
    const data = Buffer.from(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(filename.length, 26)
    locals.push(local, filename, data)
    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014B50)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt32LE(crc32(data), 16)
    directory.writeUInt32LE(data.length, 20)
    directory.writeUInt32LE(data.length, 24)
    directory.writeUInt16LE(filename.length, 28)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, filename)
    offset += local.length + filename.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
try {
  await source.initialize()
  await source.query(`CREATE SCHEMA "${schema}"`)
  await source.synchronize()
  const cache = new CacheService({ getClient: () => redis })
  cache.onModuleInit()
  class Infra {}
  Global()(Infra)
  Module({ providers: [
    { provide: DataSource, useValue: source },
    { provide: CacheService, useValue: cache },
    { provide: APP_CONFIG.KEY, useValue: { globalPrefix: 'api', baseUrl: 'http://localhost/api' } },
  ], exports: [DataSource, CacheService, APP_CONFIG.KEY] })(Infra)
  const module = await Test.createTestingModule({ imports: [Infra, UploadModule] })
    .overrideProvider(UPLOAD_STORAGE_ROOT)
    .useValue(root)
    .compile()
  app = module.createNestApplication(new FastifyAdapter({ requestTimeout: 120000 }), { logger: false })
  app.setGlobalPrefix('api')
  await app.register(multipart)
  const reflector = new Reflector()
  const jwt = new JwtService({ secret: randomUUID() })
  const headers = uid => ({ authorization: `Bearer ${jwt.sign({ uid, roleCodes: [] }, { expiresIn: '5m' })}` })
  // Real bearer verification and real RBAC, isolating unrelated auth/login infrastructure.
  app.useGlobalGuards({ async canActivate(context) {
    if (reflector.getAllAndOverride(PUBLIC_KEY, [context.getHandler(), context.getClass()]))
      return true
    const request = context.switchToHttp().getRequest()
    try {
      request.user = await jwt.verifyAsync((request.headers.authorization ?? '').replace(/^Bearer /, ''))
      return true
    }
    catch { throw new UnauthorizedException() }
  } }, new RbacGuard(reflector, { getEffectivePermissionsByUserId: async uid => uid === '1'
    ? ['system:upload-policy:read', 'system:upload-policy:write', 'system:attachment:list', 'system:attachment:read', 'system:attachment:delete']
    : [] }))
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  app.useGlobalInterceptors(new TransformInterceptor(reflector))
  app.useGlobalFilters(new CatchEverythingFilter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  const service = app.get(AttachmentService)
  const storage = app.get(LocalUploadStorage)
  const policies = app.get(UploadPolicyCacheService)
  const attachments = source.getRepository(AttachmentEntity)
  const references = source.getRepository(AttachmentReferenceEntity)
  const users = source.getRepository(SysUserEntity)
  for (const id of ['1', '2', '3']) {
    await users.save(users.create({ id, username: `test-${id}`, name: `Test ${id}`, status: 1, passwordAlgorithm: 'argon2id', passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$test', sessionVersion: 1 }))
  }
  const inject = options => app.inject(options)
  const json = (method, url, payload, uid = '1') => inject({ method, url, payload, headers: headers(uid) })
  const policy = { enabled: true, allowedFormats: ['txt', 'csv', 'png', 'pdf', 'docx', 'zip'], maxFileBytes: 1024 * 1024, maxTotalBytes: 1024 * 1024, maxFiles: 1, retentionSeconds: 3600, visibility: 'private' }
  function upload(name, mime, data, purpose = 'attachment', uid = '2', extra = '') {
    const boundary = `m71-${randomUUID()}`
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),
      Buffer.from(data),
      Buffer.from(`\r\n${extra ? `--${boundary}\r\nContent-Disposition: form-data; name="extra"\r\n\r\n${extra}\r\n` : ''}--${boundary}--\r\n`),
    ])
    return inject({ method: 'POST', url: `/api/upload?purpose=${purpose}`, payload, headers: { ...headers(uid), 'content-type': `multipart/form-data; boundary=${boundary}` } })
  }
  let privateId
  await check('policy permissions, DTO validation and standard envelope', async () => {
    assert.equal((await inject({ method: 'GET', url: '/api/system/upload-policy/attachment' })).statusCode, 401)
    assert.equal((await json('PUT', '/api/system/upload-policy/attachment', policy, '2')).statusCode, 403)
    assert.equal((await json('PUT', '/api/system/upload-policy/attachment', { ...policy, maxFileBytes: -1 })).statusCode, 400)
    const saved = await json('PUT', '/api/system/upload-policy/attachment', policy)
    assert.equal(saved.statusCode, 200, saved.body)
    assert.equal(saved.json().data, true)
    assert.equal(saved.json().success, true)
  })
  await check('real Redis hit does not query the policy table', async () => {
    await json('GET', '/api/system/upload-policy/attachment')
    const before = queries.length
    await json('GET', '/api/system/upload-policy/attachment')
    assert.equal(queries.slice(before).filter(q => q.startsWith('SELECT') && q.includes('sys_upload_policy')).length, 0)
    const ttl = await redis.pttl(uploadKeys.policy('attachment'))
    assert.ok(ttl > 0 && ttl <= 60000)
  })
  await check('real Lua rejects stale concurrent refill', async () => {
    await policies.invalidate('attachment')
    let release
    let started
    const ready = new Promise((resolve) => {
      started = resolve
    })
    const paused = new Promise((resolve) => {
      release = resolve
    })
    let calls = 0
    const value = { ...policy, purpose: 'attachment', revision: 1 }
    const pending = policies.get('attachment', async () => {
      calls++
      if (calls === 1) {
        started()
        await paused
        return value
      }
      return { ...value, revision: 2 }
    })
    await ready
    await policies.invalidate('attachment')
    release()
    assert.equal((await pending).revision, 2)
    assert.equal(calls, 2)
    await policies.invalidate('attachment')
  })
  await check('private multipart upload persists bytes and metadata', async () => {
    const response = await upload('notes.txt', 'text/plain', 'hello private')
    assert.equal(response.statusCode, 200, response.body)
    assert.equal(response.json().data.visibility, 'private')
    privateId = response.json().data.id
    assert.match(privateId, /^\d+$/)
    assert.equal(response.json().data.scanStatus, 'unscanned')
    const row = await attachments.findOneByOrFail({ id: privateId })
    assert.equal(row.sizeBytes, '13')
    assert.equal((await readFile(join(root, row.objectKey))).toString(), 'hello private')
  })
  await check('download rejects anonymous, other users and static/public bypass', async () => {
    assert.equal((await inject({ url: `/api/attachments/${privateId}/content` })).statusCode, 401)
    assert.equal((await json('GET', `/api/attachments/${privateId}/content`, undefined, '3')).statusCode, 403)
    assert.equal((await inject({ url: `/api/attachments/${privateId}/public` })).statusCode, 403)
    assert.equal((await inject({ url: `/uploads/${privateId}` })).statusCode, 404)
    const response = await json('GET', `/api/attachments/${privateId}/content`, undefined, '2')
    assert.equal(response.statusCode, 200, response.body)
    assert.equal(response.body, 'hello private')
    assert.match(response.headers['content-disposition'], /^attachment/)
    assert.equal(response.headers['cache-control'], 'private, no-store')
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.ok(await source.getRepository(AttachmentAuditEntity).existsBy({ attachmentId: privateId, action: 'download-authorized' }))
  })
  await check('administrative list/detail/download are separately protected', async () => {
    assert.equal((await json('GET', '/api/system/attachment/list', undefined, '2')).statusCode, 403)
    const response = await json('GET', '/api/system/attachment/list?name=notes&page=1&pageSize=10')
    assert.equal(response.statusCode, 200, response.body)
    assert.equal(response.json().data.total, 1)
    assert.equal((await json('GET', `/api/system/attachment/${privateId}/content`)).body, 'hello private')
    assert.equal((await json('GET', '/api/attachments/9999999999999999999', undefined, '2')).statusCode, 422)
  })
  await check('rejects binary spoofing, empty files, unknown format and extra fields with compensation', async () => {
    assert.equal((await upload('fake.png', 'image/png', 'not a png')).statusCode, 415)
    assert.equal((await upload('empty.txt', 'text/plain', '')).statusCode, 422)
    assert.equal((await upload('bad.exe', 'application/octet-stream', 'MZ')).statusCode, 415)
    assert.equal((await upload('bad.txt', 'text/plain', Buffer.from([0, 1, 2]))).statusCode, 415)
    assert.equal((await upload('extra.txt', 'text/plain', 'data', 'attachment', '2', 'extra')).statusCode, 413)
    assert.equal(await attachments.countBy({ status: 'pending' }), 0)
  })
  await check('updated size and disabled policies take effect without restart', async () => {
    await json('PUT', '/api/system/upload-policy/attachment', { ...policy, maxFileBytes: 4 })
    assert.equal((await upload('large.txt', 'text/plain', 'too large')).statusCode, 413)
    await json('PUT', '/api/system/upload-policy/attachment', { ...policy, enabled: false })
    assert.equal((await upload('small.txt', 'text/plain', 'ok')).statusCode, 403)
    await json('PUT', '/api/system/upload-policy/attachment', policy)
  })
  await check('all thirteen configured formats pass their respective validators', async () => {
    const formats = ['jpg', 'png', 'webp', 'gif', 'pdf', 'txt', 'csv', 'docx', 'xlsx', 'pptx', 'zip', 'mp3', 'mp4']
    await json('PUT', '/api/system/upload-policy/formats', { ...policy, allowedFormats: formats })
    const fixtures = {
      txt: ['text/plain', 'hello'],
      csv: ['text/csv', 'name,count\nitem,1\n'],
      pdf: ['application/pdf', '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'],
      zip: ['application/zip', zipFixture({ 'notes.txt': 'hello' })],
    }
    for (const extension of ['jpg', 'png', 'webp', 'gif']) {
      fixtures[extension] = [extension === 'jpg' ? 'image/jpeg' : `image/${extension}`, await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).toFormat(extension === 'jpg' ? 'jpeg' : extension).toBuffer()]
    }
    const office = {
      docx: ['word/document.xml', 'wordprocessingml.document', 'document'],
      xlsx: ['xl/workbook.xml', 'spreadsheetml.sheet', 'workbook'],
      pptx: ['ppt/presentation.xml', 'presentationml.presentation', 'presentation'],
    }
    for (const [extension, [main, subtype, rootElement]] of Object.entries(office)) {
      const mime = `application/vnd.openxmlformats-officedocument.${subtype}`
      fixtures[extension] = [mime, zipFixture({
        '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="${mime}.main+xml"/></Types>`,
        [main]: `<${rootElement}/>`,
      })]
    }
    const mp3 = Buffer.alloc(417 * 3)
    for (let frame = 0; frame < 3; frame++) Buffer.from([0xFF, 0xFB, 0x90, 0x64]).copy(mp3, frame * 417)
    fixtures.mp3 = ['audio/mpeg', mp3]
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4), Buffer.from('isomiso2'), Buffer.from([0, 0, 0, 8]), Buffer.from('mdat')])
    fixtures.mp4 = ['video/mp4', mp4]
    for (const [extension, [mime, data]] of Object.entries(fixtures)) {
      const response = await upload(`fixture.${extension}`, mime, data, 'formats')
      assert.equal(response.statusCode, 200, `${extension}: ${response.body}`)
    }
    assert.equal((await upload('fake.docx', fixtures.docx[0], fixtures.zip[1], 'formats')).statusCode, 415)
    assert.equal((await upload('macro.docx', fixtures.docx[0], zipFixture({ 'word/vbaProject.bin': 'bad' }), 'formats')).statusCode, 415)
    assert.equal((await upload('traversal.zip', 'application/zip', zipFixture({ '../outside': 'bad' }), 'formats')).statusCode, 415)
  })
  await check('database write rollback leaves no ready object and schedules compensation', async () => {
    await source.query(`ALTER TABLE "${schema}".sys_attachment ADD CONSTRAINT m71_test_reject_ready CHECK (original_name <> 'rollback.txt' OR status <> 'ready')`)
    const response = await upload('rollback.txt', 'text/plain', 'data')
    await source.query(`ALTER TABLE "${schema}".sys_attachment DROP CONSTRAINT m71_test_reject_ready`)
    assert.equal(response.statusCode, 503)
    const row = await attachments.findOneByOrFail({ originalName: 'rollback.txt' })
    assert.equal(row.status, 'deleted')
    await assert.rejects(readFile(join(root, row.objectKey)))
  })
  let avatarId
  await check('public avatar stays private until trusted binding, then preserves profile URL', async () => {
    await json('PUT', '/api/system/upload-policy/avatar', { ...policy, visibility: 'public', allowedFormats: ['png'] })
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
    const uploaded = await upload('avatar.png', 'image/png', png, 'avatar')
    assert.equal(uploaded.statusCode, 200, uploaded.body)
    avatarId = uploaded.json().data.id
    assert.equal((await inject({ url: `/api/attachments/${avatarId}/public` })).statusCode, 403)
    assert.equal((await json('PUT', '/api/user/avatar', { attachmentId: avatarId }, '3')).statusCode, 409)
    const bound = await json('PUT', '/api/user/avatar', { attachmentId: avatarId }, '2')
    assert.equal(bound.statusCode, 200, bound.body)
    assert.equal((await users.findOneByOrFail({ id: '2' })).avatar, uploaded.json().data.url)
    assert.equal((await inject({ url: `/api/attachments/${avatarId}/public` })).statusCode, 200)
    assert.equal((await json('DELETE', `/api/system/attachment/${avatarId}`)).statusCode, 409)
  })
  await check('cleanup preserves bound attachments, and bigint FK/unique constraints execute', async () => {
    await service.cleanup()
    assert.equal((await attachments.findOneByOrFail({ id: avatarId })).status, 'ready')
    await assert.rejects(source.query(`DELETE FROM "${schema}".sys_attachment WHERE id=$1`, [avatarId]), error => error.code === '23503')
    const ref = await references.findOneByOrFail({ attachmentId: avatarId })
    await assert.rejects(references.insert({ attachmentId: avatarId, businessType: ref.businessType, businessId: ref.businessId, field: ref.field }), error => error.code === '23505')
    await assert.rejects(source.query(`UPDATE "${schema}".sys_upload_policy SET max_file_bytes=-1 WHERE purpose='attachment'`), error => error.code === '23514')
  })
  await check('binding and cleanup serialize without deleting a newly referenced file', async () => {
    let locked
    let release
    const ready = new Promise((resolve) => {
      locked = resolve
    })
    const resume = new Promise((resolve) => {
      release = resolve
    })
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'green' } }).png().toBuffer()
    const fresh = await upload('race.png', 'image/png', png, 'avatar')
    const id = fresh.json().data.id
    await attachments.update(id, { expiresAt: new Date(Date.now() + 1000) })
    const binding = source.transaction(async (manager) => {
      await service.bind(manager, id, '2', { businessType: 'user', businessId: '2', field: 'avatar' })
      locked()
      await resume
    })
    await ready
    await new Promise(resolve => setTimeout(resolve, 1100))
    await service.cleanup()
    release()
    await binding
    assert.equal((await attachments.findOneByOrFail({ id })).status, 'ready')
    assert.equal((await json('DELETE', `/api/system/attachment/${id}`)).statusCode, 409)
    await references.softDelete({ attachmentId: id })
    await service.remove(id, '2')
  })
  await check('failed business transactions roll back the avatar reference', async () => {
    await assert.rejects(source.transaction(async (manager) => {
      await manager.getRepository(SysUserEntity).findOne({ where: { id: '2' }, lock: { mode: 'pessimistic_write' } })
      await service.unbind(manager, avatarId, '2', { businessType: 'user', businessId: '2', field: 'avatar' })
      throw new Error('rollback business')
    }))
    assert.equal(await references.existsBy({ attachmentId: avatarId }), true)
    assert.equal((await attachments.findOneByOrFail({ id: avatarId })).expiresAt, null)
  })
  await check('legacy avatar updates release references transactionally, then cleanup deletes bytes', async () => {
    await source.transaction(async (manager) => {
      await manager.getRepository(SysUserEntity).findOne({ where: { id: '2' }, lock: { mode: 'pessimistic_write' } })
      await releaseUserAvatarReferences(manager, '2')
      await manager.getRepository(SysUserEntity).update('2', { avatar: 'https://example.com/external.png' })
    })
    assert.equal((await inject({ url: `/api/attachments/${avatarId}/public` })).statusCode, 404)
    const row = await attachments.findOneByOrFail({ id: avatarId })
    await service.cleanup()
    assert.equal((await attachments.findOneByOrFail({ id: avatarId })).status, 'deleted')
    await assert.rejects(readFile(join(root, row.objectKey)), error => error.code === 'ENOENT')
  })
  await check('unknown business references never grant owner access', async () => {
    await references.save(references.create({ attachmentId: privateId, businessType: 'unknown', businessId: '100', field: 'file' }))
    assert.equal((await json('GET', `/api/attachments/${privateId}/content`, undefined, '2')).statusCode, 403)
    assert.equal((await json('DELETE', `/api/attachments/${privateId}`, undefined, '2')).statusCode, 409)
    await references.softDelete({ attachmentId: privateId })
  })
  await check('filesystem errors leave retryable deleting state, and retry is idempotent', async () => {
    const original = storage.remove.bind(storage)
    storage.remove = async () => {
      throw new Error('simulated disk error')
    }
    assert.equal((await json('DELETE', `/api/attachments/${privateId}`, undefined, '2')).statusCode, 409)
    assert.equal((await attachments.findOneByOrFail({ id: privateId })).status, 'deleting')
    storage.remove = original
    await service.cleanup()
    assert.equal((await attachments.findOneByOrFail({ id: privateId })).status, 'deleted')
    assert.equal((await json('DELETE', `/api/attachments/${privateId}`, undefined, '2')).statusCode, 200)
  })
  await check('storage rejects path traversal and symlink reads', async () => {
    await assert.rejects(storage.read('../outside'))
    const outside = join(root, 'outside.txt')
    await writeFile(outside, 'private')
    const key = randomUUID()
    await symlink(outside, join(root, key))
    await assert.rejects(storage.read(key))
    await storage.remove(key)
    assert.equal((await readFile(outside)).toString(), 'private')
    const sizeKey = randomUUID()
    await assert.rejects(storage.write(sizeKey, Readable.from([Buffer.alloc(20)]), 10))
    await assert.rejects(readFile(join(root, sizeKey)))
  })
  await check('Swagger declares the actual upload envelope and binary download boundary', async () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('M7.1 test').build())
    const upload = document.paths['/api/upload'].post
    assert.ok(upload.requestBody.content['multipart/form-data'])
    assert.ok(upload.responses['200'].content['application/json'].schema.allOf)
    assert.ok(document.paths['/api/attachments/{id}/content'].get.responses['200'].content['application/octet-stream'])
  })
  console.log(`M7.1 integration: ${completed} checks passed`)
}
finally {
  await app?.close()
  if (source.isInitialized) {
    await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await source.destroy()
  }
  // Delete only this run's prefixed Redis data; never FLUSHDB.
  let cursor = '0'
  do {
    const result = await redis.scan(cursor, 'MATCH', `${schema}:*`, 'COUNT', 100)
    cursor = result[0]
    for (const key of result[1]) await redis.del(key.slice(schema.length + 1))
  } while (cursor !== '0')
  await redis.quit()
  await rm(root, { recursive: true, force: true })
}
