import type { AppConfig } from '#/config/app.config.js'
import type { UploadResponseDto } from './dto/playground.dto.js'
import { randomUUID } from 'node:crypto'
import { mkdir, opendir, stat, unlink, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Inject, Injectable, Logger, OnModuleInit, PayloadTooLargeException, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common'
import { APP_CONFIG } from '#/config/app.config.js'
import { PLAYGROUND_UPLOAD_MAX_BYTES, PLAYGROUND_UPLOAD_RETENTION_MS } from './playground.constants.js'

interface ImageType {
  extension: 'jpg' | 'png' | 'webp'
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface PlaygroundUploadInput {
  buffer: Buffer
  mimeType: string
}

export function detectPlaygroundImageType(buffer: Buffer): ImageType | undefined {
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
  ) {
    return { extension: 'png', mimeType: 'image/png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF)
    return { extension: 'jpg', mimeType: 'image/jpeg' }
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { extension: 'webp', mimeType: 'image/webp' }
  }
  return undefined
}

@Injectable()
export class PlaygroundUploadService implements OnModuleInit {
  private readonly logger = new Logger(PlaygroundUploadService.name)
  private readonly uploadRoot = resolve(process.cwd(), 'public', 'uploads')

  constructor(@Inject(APP_CONFIG.KEY) private readonly appConfig: AppConfig) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.uploadRoot, { recursive: true })
    await this.cleanupExpiredUploads()
  }

  async storeImage(input: PlaygroundUploadInput): Promise<UploadResponseDto> {
    if (!input.buffer.length)
      throw new UnsupportedMediaTypeException('上传图片不能为空')
    if (input.buffer.length > PLAYGROUND_UPLOAD_MAX_BYTES)
      throw new PayloadTooLargeException(`图片大小不能超过 ${PLAYGROUND_UPLOAD_MAX_BYTES} 字节`)

    const imageType = detectPlaygroundImageType(input.buffer)
    if (!imageType || imageType.mimeType !== input.mimeType) {
      throw new UnsupportedMediaTypeException('仅支持内容与 MIME 一致的 JPEG、PNG 或 WebP 图片')
    }

    await this.cleanupExpiredUploads()
    const now = new Date()
    const year = String(now.getUTCFullYear())
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const directory = this.safeStoragePath(year, month)
    await mkdir(directory, { recursive: true })

    const objectName = `${randomUUID()}.${imageType.extension}`
    const target = this.safeStoragePath(year, month, objectName)
    try {
      await writeFile(target, input.buffer, { flag: 'wx', mode: 0o640 })
    }
    catch (error) {
      this.logger.error(`Failed to persist playground upload: ${(error as Error).message}`)
      throw new ServiceUnavailableException('临时上传存储当前不可用')
    }

    const publicPath = `/uploads/${year}/${month}/${objectName}`
    return { url: this.publicUrl(publicPath) }
  }

  async cleanupExpiredUploads(now: number = Date.now()): Promise<void> {
    const cutoff = now - PLAYGROUND_UPLOAD_RETENTION_MS
    try {
      await mkdir(this.uploadRoot, { recursive: true })
      await this.cleanupDirectory(this.uploadRoot, cutoff)
    }
    catch (error) {
      this.logger.warn(`Failed to clean expired playground uploads: ${(error as Error).message}`)
    }
  }

  private async cleanupDirectory(directory: string, cutoff: number): Promise<void> {
    const entries = await opendir(directory)
    for await (const entry of entries) {
      const target = this.safeStoragePath(directory, entry.name)
      if (entry.isDirectory()) {
        await this.cleanupDirectory(target, cutoff)
      }
      else if (!entry.name.startsWith('.')) {
        const file = await stat(target)
        if (file.mtimeMs < cutoff)
          await unlink(target)
      }
    }
  }

  private publicUrl(publicPath: string): string {
    const baseUrl = this.appConfig.baseUrl?.trim()
    if (!baseUrl)
      return publicPath
    return new URL(publicPath, `${new URL(baseUrl).origin}/`).toString()
  }

  private safeStoragePath(...segments: string[]): string {
    const target = resolve(this.uploadRoot, ...segments)
    if (target !== this.uploadRoot && !target.startsWith(`${this.uploadRoot}${sep}`))
      throw new Error('Playground upload path escaped its storage root')
    return target
  }
}
