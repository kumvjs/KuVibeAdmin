import type { UploadPolicyResponseDto } from './dto/upload-policy.dto.js'
import { randomUUID } from 'node:crypto'
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { CacheService } from '#/shared/cache/cache.service.js'
import { uploadKeys } from '#/shared/cache/keys/upload.keys.js'
import { validateUploadPolicy } from './upload-policy.rules.js'
import { UPLOAD_POLICY_CACHE_SECONDS } from './upload.constants.js'

// A changed/evicted generation must reject every older in-flight refill.
export const FILL_UPLOAD_POLICY = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
  return 1
`
export const INVALIDATE_UPLOAD_POLICY = `
  redis.call('SET', KEYS[1], ARGV[1])
  redis.call('DEL', KEYS[2])
  return 1
`

@Injectable()
export class UploadPolicyCacheService {
  private readonly logger = new Logger(UploadPolicyCacheService.name)
  private readonly pending = new Map<string, Promise<UploadPolicyResponseDto | null>>()
  private nextFallbackAt = 0
  private refillUnavailableUntil = 0

  constructor(private readonly cache: CacheService) {}

  async get(purpose: string, loader: () => Promise<UploadPolicyResponseDto | null>): Promise<UploadPolicyResponseDto | null> {
    const existing = this.pending.get(purpose)
    if (existing)
      return existing
    const promise = this.load(purpose, loader)
    this.pending.set(purpose, promise)
    try {
      return await promise
    }
    finally {
      this.pending.delete(purpose)
    }
  }

  private async load(purpose: string, loader: () => Promise<UploadPolicyResponseDto | null>): Promise<UploadPolicyResponseDto | null> {
    if (Date.now() < this.refillUnavailableUntil)
      throw new ServiceUnavailableException('上传策略缓存回填故障，请稍后重试')
    const redis = this.cache.getClient()
    const generationKey = uploadKeys.policyGeneration(purpose)
    const valueKey = uploadKeys.policy(purpose)

    for (let attempt = 0; attempt < 3; attempt++) {
      const startedAt = Date.now()
      let generation: string | null
      try {
        // Do not expire generations: random replacements also fence Redis eviction/restart.
        await redis.set(generationKey, randomUUID(), 'NX')
        generation = await redis.get(generationKey)
        if (!generation)
          continue
        const raw = await redis.get(valueKey)
        if (raw) {
          try {
            const entry = JSON.parse(raw)
            if (entry.generation === generation && entry.schema === 1) {
              if (entry.value === null)
                return null
              return this.validSnapshot(purpose, entry.value)
            }
          }
          catch {
            // Invalid cache data is a miss; never silently relax a policy.
          }
        }
      }
      catch {
        this.logger.warn('上传策略缓存不可用，执行限流回源')
        if (Date.now() < this.nextFallbackAt)
          throw new ServiceUnavailableException('上传策略回源繁忙，请稍后重试')
        this.nextFallbackAt = Date.now() + 1000
        return this.loadValidated(purpose, loader)
      }

      const value = await this.loadValidated(purpose, loader)
      const ttl = UPLOAD_POLICY_CACHE_SECONDS * 1000 - (Date.now() - startedAt)
      if (ttl <= 0)
        throw new ServiceUnavailableException('上传策略读取超时')
      try {
        const filled = await redis.eval(
          FILL_UPLOAD_POLICY,
          2,
          generationKey,
          valueKey,
          generation,
          JSON.stringify({ schema: 1, generation, value }),
          ttl,
        )
        if (Number(filled) === 1)
          return value
      }
      catch {
        // A valid DB snapshot is still usable for this request; it was never cached.
        this.refillUnavailableUntil = Date.now() + 1000
        this.logger.warn('上传策略回填失败，本次使用已校验的数据库快照')
        return value
      }
    }
    throw new ServiceUnavailableException('上传策略正在变更，请稍后重试')
  }

  private async loadValidated(purpose: string, loader: () => Promise<UploadPolicyResponseDto | null>): Promise<UploadPolicyResponseDto | null> {
    try {
      const value = await loader()
      return value === null ? null : this.validSnapshot(purpose, value)
    }
    catch {
      throw new ServiceUnavailableException('无法取得有效上传策略')
    }
  }

  private validSnapshot(purpose: string, value: UploadPolicyResponseDto): UploadPolicyResponseDto {
    const { purpose: cachedPurpose, revision, ...state } = value
    if (cachedPurpose !== purpose || !Number.isSafeInteger(revision) || revision < 1)
      throw new Error('Invalid upload policy snapshot')
    const validated = validateUploadPolicy(purpose, state)
    return { ...validated, purpose, revision }
  }

  async invalidate(purpose: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.cache.getClient().eval(
          INVALIDATE_UPLOAD_POLICY,
          2,
          uploadKeys.policyGeneration(purpose),
          uploadKeys.policy(purpose),
          randomUUID(),
        )
        return
      }
      catch {
        this.logger.warn(`上传策略缓存失效失败（${attempt + 1}/3）：${purpose}`)
      }
    }
    this.logger.error(`上传策略已提交但缓存失效失败：${purpose}；旧快照最多保留 ${UPLOAD_POLICY_CACHE_SECONDS} 秒`)
    throw new ServiceUnavailableException('策略已保存，但缓存刷新失败；请重试保存，旧缓存最多保留 60 秒')
  }
}
