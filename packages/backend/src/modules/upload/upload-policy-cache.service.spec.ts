import type { UploadPolicyResponseDto } from './dto/upload-policy.dto.js'
import { ServiceUnavailableException } from '@nestjs/common'
import { CacheService } from '#/shared/cache/cache.service.js'
import { uploadKeys } from '#/shared/cache/keys/upload.keys.js'
import { FILL_UPLOAD_POLICY, INVALIDATE_UPLOAD_POLICY, UploadPolicyCacheService } from './upload-policy-cache.service.js'

const snapshot: UploadPolicyResponseDto = {
  purpose: 'attachment',
  revision: 1,
  enabled: true,
  allowedFormats: ['pdf'],
  maxFileBytes: 1024,
  maxTotalBytes: 1024,
  maxFiles: 1,
  visibility: 'private',
  retentionSeconds: 3600,
}

function harness() {
  const values = new Map<string, string>()
  const redis = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      if (!values.has(key))
        values.set(key, value)
      return 'OK'
    }),
    eval: jest.fn(async (script: string, _count: number, generationKey: string, valueKey: string, generation: string, payload?: string, _ttl?: number) => {
      if (script === INVALIDATE_UPLOAD_POLICY) {
        values.set(generationKey, generation)
        values.delete(valueKey)
        return 1
      }
      if (script === FILL_UPLOAD_POLICY && values.get(generationKey) === generation) {
        values.set(valueKey, payload!)
        return 1
      }
      return 0
    }),
  }
  const service = new UploadPolicyCacheService({ getClient: () => redis } as unknown as CacheService)
  return { service, redis, values }
}

describe('upload policy cache', () => {
  it('serves subsequent requests without reading the policy table', async () => {
    const { service, redis } = harness()
    const loader = jest.fn().mockResolvedValue(snapshot)
    await expect(service.get('attachment', loader)).resolves.toEqual(snapshot)
    await expect(service.get('attachment', loader)).resolves.toEqual(snapshot)
    expect(loader).toHaveBeenCalledTimes(1)
    const ttl = redis.eval.mock.calls[0][6]
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60_000)
  })

  it('fences a refill that started before a committed update', async () => {
    const { service } = harness()
    let finish!: (value: UploadPolicyResponseDto) => void
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const oldQuery = new Promise<UploadPolicyResponseDto>((resolve) => {
      finish = resolve
    })
    const fresh = { ...snapshot, revision: 2, enabled: false }
    const loader = jest.fn().mockImplementationOnce(() => {
      started()
      return oldQuery
    }).mockResolvedValue(fresh)
    const pending = service.get('attachment', loader)
    await ready
    await service.invalidate('attachment')
    finish(snapshot)
    await expect(pending).resolves.toEqual(fresh)
    await expect(service.get('attachment', loader)).resolves.toEqual(fresh)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent misses within the process', async () => {
    const { service } = harness()
    const loader = jest.fn().mockResolvedValue(snapshot)
    await Promise.all([service.get('attachment', loader), service.get('attachment', loader)])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('negative-caches missing policies and invalidates them on creation', async () => {
    const { service } = harness()
    const loader = jest.fn().mockResolvedValue(null)
    await service.get('attachment', loader)
    await service.get('attachment', loader)
    expect(loader).toHaveBeenCalledTimes(1)
    await service.invalidate('attachment')
    loader.mockResolvedValue(snapshot)
    await expect(service.get('attachment', loader)).resolves.toEqual(snapshot)
  })

  it('treats corrupt cached settings as a miss and rejects corrupt database settings', async () => {
    const { service, values } = harness()
    values.set(uploadKeys.policyGeneration('attachment'), 'g')
    values.set(uploadKeys.policy('attachment'), JSON.stringify({ schema: 1, generation: 'g', value: { ...snapshot, maxFileBytes: -1 } }))
    const loader = jest.fn().mockResolvedValue(snapshot)
    await expect(service.get('attachment', loader)).resolves.toEqual(snapshot)
    expect(loader).toHaveBeenCalledTimes(1)
    await service.invalidate('attachment')
    loader.mockResolvedValue({ ...snapshot, visibility: 'public' })
    await expect(service.get('attachment', loader)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('rate-limits database fallback during Redis failure', async () => {
    const { service, redis } = harness()
    redis.set.mockRejectedValue(new Error('offline'))
    const loader = jest.fn().mockResolvedValue(snapshot)
    await expect(service.get('attachment', loader)).resolves.toEqual(snapshot)
    await expect(service.get('attachment', loader)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('fails closed if both Redis and the database are unavailable', async () => {
    const { service, redis } = harness()
    redis.set.mockRejectedValue(new Error('offline'))
    await expect(service.get('attachment', jest.fn().mockRejectedValue(new Error('offline'))))
      .rejects
      .toBeInstanceOf(ServiceUnavailableException)
  })

  it('does not hammer the database when only Redis refill writes fail', async () => {
    const { service, redis } = harness()
    redis.eval.mockRejectedValue(new Error('read-only'))
    const loader = jest.fn().mockResolvedValue(snapshot)
    await expect(service.get('attachment', loader)).resolves.toEqual(snapshot)
    await expect(service.get('attachment', loader)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('retries invalidation three times and reports a committed-but-stale failure', async () => {
    const { service, redis } = harness()
    redis.eval.mockRejectedValue(new Error('offline'))
    await expect(service.invalidate('attachment')).rejects.toThrow('策略已保存')
    expect(redis.eval).toHaveBeenCalledTimes(3)
  })
})
