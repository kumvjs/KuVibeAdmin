import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { PayloadTooLargeException } from '@nestjs/common'
import { LocalUploadStorage } from './local-upload.storage.js'

describe('local attachment streaming storage', () => {
  let root: string
  let storage: LocalUploadStorage
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'attachment-storage-test-')))
    storage = new LocalUploadStorage(root)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('streams bytes and preserves the SHA-256 digest', async () => {
    const key = randomUUID()
    const saved = await storage.write(key, Readable.from([Buffer.from('hello')]), 5)
    expect(saved.size).toBe(5)
    expect(await storage.digest(key)).toEqual({ size: saved.size, sha256: saved.sha256 })
  })

  it('removes partial files on a size violation', async () => {
    const key = randomUUID()
    await expect(storage.write(key, Readable.from([Buffer.alloc(11)]), 10)).rejects.toBeInstanceOf(PayloadTooLargeException)
    await expect(readFile(join(root, key))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects multipart streams already destroyed before async persistence', async () => {
    const stream = Readable.from([Buffer.from('data')])
    stream.destroy()
    await expect(storage.write(randomUUID(), stream, 100)).rejects.toBeInstanceOf(PayloadTooLargeException)
  })

  it('does not follow symlinks or user-controlled paths', async () => {
    const key = randomUUID()
    const outside = join(root, 'outside')
    await writeFile(outside, 'secret')
    await symlink(outside, join(root, key))
    await expect(storage.read(key)).rejects.toThrow()
    await expect(storage.read('../outside')).rejects.toThrow()
    await storage.remove(key)
    expect(await readFile(outside, 'utf8')).toBe('secret')
  })

  it('refuses overwrite and makes deletion idempotent', async () => {
    const key = randomUUID()
    await storage.write(key, Readable.from(['first']), 10)
    await expect(storage.write(key, Readable.from(['second']), 10)).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(join(root, key), 'utf8')).toBe('first')
    await storage.remove(key)
    await storage.remove(key)
  })
})
