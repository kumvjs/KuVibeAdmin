import type { AppConfig } from '#/config/app.config.js'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import { detectPlaygroundImageType, PlaygroundUploadService } from './playground-upload.service.js'
import { PLAYGROUND_UPLOAD_MAX_BYTES, PLAYGROUND_UPLOAD_RETENTION_MS } from './playground.constants.js'

describe('playground upload storage', () => {
  let temporaryRoot: string
  let cwdSpy: jest.SpiedFunction<typeof process.cwd>
  let service: PlaygroundUploadService

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'nest-ai-playground-'))
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(temporaryRoot)
    service = new PlaygroundUploadService({
      baseUrl: 'http://localhost:7001/api',
    } as AppConfig)
    await service.onModuleInit()
  })

  afterEach(async () => {
    cwdSpy.mockRestore()
    await rm(temporaryRoot, { force: true, recursive: true })
  })

  it('detects supported raster signatures instead of trusting filenames', () => {
    expect(detectPlaygroundImageType(Buffer.from([0xFF, 0xD8, 0xFF])))
      .toEqual({ extension: 'jpg', mimeType: 'image/jpeg' })
    expect(detectPlaygroundImageType(Buffer.from('not-an-image'))).toBeUndefined()
  })

  it('stores a random, publicly addressable temporary image outside the API prefix', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const result = await service.storeImage({ buffer: png, mimeType: 'image/png' })
    const relativePath = new URL(result.url).pathname.replace(/^\/uploads\//, '')
    const storedPath = join(temporaryRoot, 'public', 'uploads', relativePath)

    expect(result.url).toMatch(/^http:\/\/localhost:7001\/uploads\/\d{4}\/\d{2}\/[\da-f-]+\.png$/)
    await expect(readFile(storedPath)).resolves.toEqual(png)
  })

  it('rejects MIME spoofing and oversized buffers', async () => {
    await expect(service.storeImage({
      buffer: Buffer.from('<script>alert(1)</script>'),
      mimeType: 'image/png',
    })).rejects.toBeInstanceOf(UnsupportedMediaTypeException)

    await expect(service.storeImage({
      buffer: Buffer.alloc(PLAYGROUND_UPLOAD_MAX_BYTES + 1),
      mimeType: 'image/png',
    })).rejects.toBeInstanceOf(PayloadTooLargeException)
  })

  it('removes expired non-hidden files during bounded lifecycle cleanup', async () => {
    const expiredPath = join(temporaryRoot, 'public', 'uploads', '2020', '01', 'expired.png')
    await writeFileWithDirectory(expiredPath, Buffer.from('expired'))
    const expiredAt = new Date(Date.now() - PLAYGROUND_UPLOAD_RETENTION_MS - 1_000)
    await utimes(expiredPath, expiredAt, expiredAt)

    await service.cleanupExpiredUploads()

    await expect(readFile(expiredPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

async function writeFileWithDirectory(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}
