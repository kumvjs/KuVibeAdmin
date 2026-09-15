import type { FastifyReply, FastifyRequest } from 'fastify'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { PUBLIC_KEY } from '#/common/decorators/public.decorator.js'
import { SKIP_RESPONSE_TRANSFORM } from '#/common/decorators/skip-response-transform.decorator.js'
import { PLAYGROUND_BIGINT_RESPONSE } from './playground-fixtures.js'
import { PlaygroundUploadService } from './playground-upload.service.js'
import { isPlaygroundEnabled } from './playground.constants.js'
import { PlaygroundController } from './playground.controller.js'
import { PlaygroundService } from './playground.service.js'

describe('vben v5.7.0 playground contract', () => {
  const uploadService = {
    storeImage: jest.fn(),
  }
  const controller = new PlaygroundController(
    new PlaygroundService(),
    uploadService as unknown as PlaygroundUploadService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('registers the playground outside production only', () => {
    expect(isPlaygroundEnabled('development')).toBe(true)
    expect(isPlaygroundEnabled('local')).toBe(true)
    expect(isPlaygroundEnabled('test')).toBe(true)
    expect(isPlaygroundEnabled('production')).toBe(false)
  })

  it('keeps the exact four frontend routes and does not add mock-only test handlers', () => {
    const prototype = PlaygroundController.prototype
    expect(Reflect.getMetadata(PATH_METADATA, prototype.getTable)).toBe('table/list')
    expect(Reflect.getMetadata(PATH_METADATA, prototype.upload)).toBe('upload')
    expect(Reflect.getMetadata(PATH_METADATA, prototype.getBigint)).toBe('demo/bigint')
    expect(Reflect.getMetadata(PATH_METADATA, prototype.getStatus)).toBe('status')
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.getTable)).toBeDefined()
    expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['getTest', 'postTest']))
  })

  it('makes only the status simulator public and keeps raw-response boundaries explicit', () => {
    const prototype = PlaygroundController.prototype
    expect(Reflect.getMetadata(PUBLIC_KEY, prototype.getStatus)).toBe(true)
    expect(Reflect.getMetadata(PUBLIC_KEY, prototype.getTable)).toBeUndefined()
    expect(Reflect.getMetadata(PUBLIC_KEY, prototype.upload)).toBeUndefined()
    expect(Reflect.getMetadata(PUBLIC_KEY, prototype.getBigint)).toBeUndefined()
    expect(Reflect.getMetadata(SKIP_RESPONSE_TRANSFORM, prototype.getStatus)).toBe(true)
    expect(Reflect.getMetadata(SKIP_RESPONSE_TRANSFORM, prototype.getBigint)).toBe(true)
  })

  it('returns the requested status with the standard project error envelope', () => {
    const reply = { status: jest.fn().mockReturnThis() } as unknown as FastifyReply
    const result = controller.getStatus({ status: 401 }, reply)

    expect(reply.status).toHaveBeenCalledWith(401)
    expect(result).toEqual(expect.objectContaining({ code: -1, data: null, success: false }))
  })

  it('sends the bigint fixture as raw JSON numeric literals without precision loss', () => {
    const reply = {
      send: jest.fn(),
      type: jest.fn().mockReturnThis(),
    } as unknown as FastifyReply

    controller.getBigint(reply)

    expect(reply.type).toHaveBeenCalledWith('application/json')
    expect(reply.send).toHaveBeenCalledWith(PLAYGROUND_BIGINT_RESPONSE)
    expect(PLAYGROUND_BIGINT_RESPONSE).toContain('123456789012345678901234567890123456789012345678901234567890')
  })

  it('accepts exactly one multipart file and returns the upload URL contract', async () => {
    const file = {
      fieldname: 'file',
      file: { truncated: false },
      mimetype: 'image/png',
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('png')),
      type: 'file',
    }
    const request = {
      parts: jest.fn(() => (async function* () { yield file })()),
    } as unknown as FastifyRequest
    uploadService.storeImage.mockResolvedValue({ url: 'http://localhost:7001/uploads/demo.png' })

    await expect(controller.upload(request)).resolves.toEqual({
      url: 'http://localhost:7001/uploads/demo.png',
    })
    expect(uploadService.storeImage).toHaveBeenCalledWith({
      buffer: Buffer.from('png'),
      mimeType: 'image/png',
    })
  })
})
