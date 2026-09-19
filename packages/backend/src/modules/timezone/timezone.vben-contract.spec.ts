import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Repository } from 'typeorm'
import { HttpStatus, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CatchEverythingFilter } from '#/common/filters/catch-everything.filter.js'
import { TransformInterceptor } from '#/common/interceptors/transform.interceptor.js'
import { RbacGuard } from '#/modules/auth/guards/rbac.guard.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { SetTimezoneDto } from './dto/timezone.dto.js'
import { TimezoneController } from './timezone.controller.js'
import { TimezoneService } from './timezone.service.js'

describe('vben M6 HTTP 与 OpenAPI 契约', () => {
  let app: NestFastifyApplication
  const records = new Map<string, string | null>()
  const users = {
    findOne: jest.fn(async ({ where }) => records.has(where.id) ? { id: where.id, timezone: records.get(where.id) } : null),
    update: jest.fn(async (where, patch) => {
      if (!records.has(where.id))
        return { affected: 0 }
      records.set(where.id, patch.timezone)
      return { affected: 1 }
    }),
  }
  const cache = { delCache: jest.fn() }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TimezoneController],
      providers: [TimezoneService, { provide: getRepositoryToken(SysUserEntity), useValue: users }, { provide: CacheService, useValue: cache }],
    }).compile()
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api')
    // 注入认证后的身份，使用实际 RBAC guard 检查公开/当前用户边界；完整 Passport 链属于 M8。
    app.getHttpAdapter().getInstance().addHook('preHandler', async (request) => {
      const id = request.headers['x-test-user']
      if (typeof id === 'string')
        (request as any).user = { uid: id, roleCodes: [] }
    })
    app.useGlobalGuards(new RbacGuard(new Reflector(), {} as never))
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    app.useGlobalInterceptors(new TransformInterceptor(new Reflector()))
    app.useGlobalFilters(new CatchEverythingFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  beforeEach(() => {
    records.clear()
    records.set('42', null)
    records.set('43', 'Asia/Seoul')
  })

  afterAll(async () => app?.close())

  it('选项公开且覆盖原五个选项及更多 IANA 区域', async () => {
    const result = await app.inject({ method: 'GET', url: '/api/timezone/getTimezoneOptions' })
    expect(result.statusCode).toBe(200)
    expect(result.json()).toMatchObject({ code: 0, success: true })
    expect(result.json().data).toEqual(expect.arrayContaining(['America/New_York', 'Europe/London', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Europe/Paris'].map(value => ({ label: value, value }))))
  })

  it('拒绝未认证的偏好读写', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const result = await app.inject({ method, url: `/api/timezone/${method === 'GET' ? 'getTimezone' : 'setTimezone'}`, ...(method === 'POST' ? { payload: { timezone: null } } : {}) })
      expect(result.json().success).toBe(false)
      expect(result.statusCode).toBeGreaterThanOrEqual(400)
    }
  })

  it('保存/读取/清空偏好，不能通过 body 指定其他用户', async () => {
    const initial = await app.inject({ method: 'GET', url: '/api/timezone/getTimezone', headers: { 'x-test-user': '42' } })
    expect(initial.json().data).toBeNull()
    const save = await app.inject({ method: 'POST', url: '/api/timezone/setTimezone', headers: { 'x-test-user': '42' }, payload: { timezone: 'Asia/Tokyo', userId: '43' } })
    expect(save.statusCode).toBe(200)
    expect(save.json()).toMatchObject({ data: true, success: true })
    const anotherInstance = new TimezoneService(users as unknown as Repository<SysUserEntity>, cache as unknown as CacheService)
    await expect(anotherInstance.getTimezone('42')).resolves.toBe('Asia/Tokyo')
    await expect(anotherInstance.getTimezone('43')).resolves.toBe('Asia/Seoul')
    const clear = await app.inject({ method: 'POST', url: '/api/timezone/setTimezone', headers: { 'x-test-user': '42' }, payload: { timezone: null } })
    expect(clear.json().data).toBe(true)
    await expect(anotherInstance.getTimezone('42')).resolves.toBeNull()
  })

  it.each([{}, { timezone: '' }, { timezone: 'GMT+8' }, { timezone: 8 }, { timezone: 'Fake/Zone' }])('拒绝非法请求 %j', async (payload) => {
    const result = await app.inject({ method: 'POST', url: '/api/timezone/setTimezone', headers: { 'x-test-user': '42' }, payload })
    expect(result.statusCode).toBe(422)
    expect(result.json()).toMatchObject({ success: false, data: null })
    expect(records.get('42')).toBeNull()
  })

  it('swagger 声明必填但可空的写入字段和可空读取结果', () => {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build(), { extraModels: [SetTimezoneDto] })
    const dto = doc.components!.schemas!.SetTimezoneDto as any
    expect(dto.required).toContain('timezone')
    expect(dto.properties.timezone).toMatchObject({ type: 'string', nullable: true })
    const response = doc.paths['/api/timezone/getTimezone'].get!.responses['200'] as any
    expect(response.content['application/json'].schema.allOf[1].properties.data).toMatchObject({ type: 'string', nullable: true })
    expect(doc.paths['/api/timezone/setTimezone'].post!.responses).toHaveProperty('200')
  })
})
