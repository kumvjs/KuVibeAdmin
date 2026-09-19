import type { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'

export const UPLOAD_STORAGE_ROOT = Symbol('UPLOAD_STORAGE_ROOT')

/** Storage boundary: only server-generated flat UUID keys, never user paths. */
@Injectable()
export class LocalUploadStorage {
  constructor(@Inject(UPLOAD_STORAGE_ROOT) private readonly root: string) {}

  private async path(key: string): Promise<string> {
    if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(key))
      throw new Error('Invalid attachment storage key')
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    if ((await lstat(this.root)).isSymbolicLink() || await realpath(this.root) !== resolve(this.root))
      throw new Error('Attachment storage root must not contain symbolic links')
    return resolve(this.root, key)
  }

  async write(key: string, input: Readable, limit: number): Promise<{ size: number, sha256: string, path: string }> {
    if (input.destroyed)
      throw new PayloadTooLargeException('multipart 输入已被限制器终止')
    const path = await this.path(key)
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    let size = 0
    const hash = createHash('sha256')
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > limit)
          return callback(new PayloadTooLargeException('文件超出上传策略大小限制'))
        hash.update(chunk)
        callback(null, chunk)
      },
    })
    try {
      // Multipart can destroy the stream while the pending DB row/file is created.
      // Attaching pipeline after that close event must not wait until its timeout.
      if (input.destroyed)
        throw new PayloadTooLargeException('multipart 输入已被限制器终止')
      await pipeline(input, counter, handle.createWriteStream(), { signal: AbortSignal.timeout(120_000) })
      return { path, size, sha256: hash.digest('hex') }
    }
    catch (error) {
      await handle.close().catch(() => {})
      // The DB pending row remains available for cleanup if removal fails.
      await this.remove(key).catch(() => {})
      throw error
    }
  }

  async read(key: string) {
    try {
      const handle = await open(await this.path(key), constants.O_RDONLY | constants.O_NOFOLLOW)
      const stat = await handle.stat()
      if (!stat.isFile()) {
        await handle.close()
        throw new NotFoundException('附件文件不可用')
      }
      return { stream: handle.createReadStream(), size: stat.size }
    }
    catch (error) {
      if (['ENOENT', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw new NotFoundException('附件文件不可用')
      throw error
    }
  }

  async digest(key: string): Promise<{ size: number, sha256: string }> {
    const { stream, size } = await this.read(key)
    const hash = createHash('sha256')
    for await (const chunk of stream)
      hash.update(chunk)
    return { size, sha256: hash.digest('hex') }
  }

  async remove(key: string): Promise<void> {
    const path = await this.path(key)
    for (const target of [path, `${path}.normalized`]) {
      try {
        await unlink(target)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw error
      }
    }
  }
}
