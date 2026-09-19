import { randomUUID } from 'node:crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { CACHE_JITTER, CAHCE_TTL, NULL_PLACEHOLDER } from '#/common/constants/cache.constant.js'
import { RedisKeys } from './keys/index.js'
import { RedisService } from './redis/redis.servie.js'

type CacheValue = | string | number | boolean | object | null

export interface CacheGetOrSetOptions {
  ttl?: number // 基础过期时间（秒）
  jitter?: number // TTL 随机抖动上限（秒），防雪崩
  lockTtl?: number // 分布式锁超时（秒），防击穿
  nullTtl?: number // 空值缓存 TTL（秒），防穿透
  allowNull?: boolean // 是否允许缓存 null
  maxRetry?: number // 最大自旋重试次数
}

const DEFAULT_OPTIONS: Required<CacheGetOrSetOptions> = {
  ttl: CAHCE_TTL.DEFAULT,
  jitter: CACHE_JITTER.DEFAULT,
  lockTtl: 5, // 分布式锁不宜过长，5秒足够覆盖绝大多数 loader
  nullTtl: CAHCE_TTL.SHORT,
  allowNull: true,
  maxRetry: 3,
}

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name)
  private readonly namespace: string = 'default'
  private releaseLockLua: string = ''

  constructor(
    private readonly redisService: RedisService,
  ) { }

  onModuleInit() {
    // 初始化原子解锁的 Lua 脚本：只有当锁的值匹配时才允许删除，防止误删他人的锁
    this.releaseLockLua = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `
  }

  getClient() {
    return this.redisService.getClient(this.namespace)
  }

  /**
   * 核心方法：带防击穿、防雪崩、防穿透的缓存获取（增强自旋锁与原子解锁）
   */
  async getOrSet<T>(
    key: CacheKey<T>,
    loader: () => Promise<T | null> | T | null,
    options?: CacheGetOrSetOptions,
  ): Promise<T | null | undefined> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const redis = this.redisService.getClient()
    // 1. 读缓存
    const cached = await this.getCache<T>(key)
    if (cached !== undefined)
      return cached

    // 2. 缓存未命中，加分布式锁防击穿
    const lockKey = RedisKeys.lock(key)
    const lockValue = randomUUID() // 生成唯一标识，用于安全解锁

    let acquired = false
    const maxRetry = opts.maxRetry ?? 3 // 最大自旋重试次数

    for (let i = 0; i < maxRetry; i++) {
      const res = await redis.set(lockKey, lockValue, 'EX', opts.lockTtl, 'NX')
      if (res === 'OK') {
        acquired = true
        break
      }
      // 未抢到锁：进入退避自旋等待
      await this.sleep(150 + Math.random() * 50) // 引入微量抖动，错开重试并发

      // 每次重试前再次尝试读缓存，可能上一个线程已经写入
      const retryCheck = await this.getCache<T>(key)
      if (retryCheck !== undefined)
        return retryCheck
    }

    // 彻底拿不到锁，降级抛出异常或返回 null，此处遵循原作者意图返回 null
    if (!acquired) {
      this.logger.warn(`[Cache] 获取分布式锁并发竞争失败，执行降级。key=${key}`)
      return null
    }

    try {
      // 3. 再次双重检查（Double Check）
      const doubleCheck = await this.getCache<T>(key)
      if (doubleCheck !== undefined)
        return doubleCheck

      // 4. 查数据源
      const value = await loader()

      if (value === null || value === undefined) {
        if (opts.allowNull) {
          // 防穿透：缓存空值
          await redis.set(key, NULL_PLACEHOLDER, 'EX', opts.nullTtl)
        }
        return null
      }

      // 5. 写缓存，TTL 加随机抖动防雪崩
      const jitterTime = Math.floor(Math.random() * opts.jitter)
      const finalTtl = opts.ttl + jitterTime

      await this.setCache(key, value, finalTtl)
      return value
    }
    catch (err) {
      this.logger.error(`[Cache] loader 执行失败，不写入缓存。key=${key}`, err)
      throw err
    }
    finally {
      // 6. 安全释放锁：使用 Lua 脚本保证只释放自己加的锁
      await redis.eval(this.releaseLockLua, 1, lockKey, lockValue).catch((err) => {
        this.logger.error(`[Cache] 释放分布式锁失败. key=${lockKey}`, err)
      })
    }
  }

  async setCache<T>(
    key: CacheKey<T>,
    value: T,
    ttl: number | 'forever' = 'forever',
  ): Promise<void> {
    const redis
      = this.getClient()
    let payload
    try {
      if (value === null) {
        payload = NULL_PLACEHOLDER
      }
      else {
        payload = JSON.stringify({ value })
      }
    }
    catch (e) {
      this.logger.error('缓存数据类型有误')
    }

    if (ttl === 'forever') {
      await redis.set(key, payload)
      return
    }
    await redis.set(
      key,
      payload,
      'EX',
      ttl,
    )
  }

  async getCache<T>(key: CacheKey<T>): Promise<T | null | undefined> {
    const redis = this.getClient()
    const raw = await redis.get(key)
    if (raw === null)
      return undefined
    if (raw === NULL_PLACEHOLDER)
      return null
    try {
      return this.deserialize(raw)
    }
    catch {
      this.logger.warn(`[Cache] JSON 解析失败，清理脏数据. key=${key}`)
      await redis.del(key)
      return undefined
    }
  }

  deserialize<T>(raw: string): T {
    return JSON.parse(raw).value as T
  }

  /**
   * 主动删除缓存
   */
  async delCache(key: string): Promise<void> {
    await this.getClient().del(key)
  }

  /**
   * 批量删除（开源标准版：使用 SCAN 代替 KEYS，严禁阻塞 Redis 单线程）
   */
  async delCacheByPrefix(prefix: string): Promise<void> {
    const matchPattern = `${prefix}*`
    let cursor = '0'

    do {
      // 每次扫描 100 条，不影响线上业务响应
      const [nextCursor, keys] = await this.getClient().scan(cursor, 'MATCH', matchPattern, 'COUNT', 100)
      cursor = nextCursor

      if (keys.length > 0) {
        await this.getClient().del(...keys)
      }
    } while (cursor !== '0')
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
