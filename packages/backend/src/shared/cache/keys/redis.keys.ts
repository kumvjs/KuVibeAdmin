const REDIS_PREFIX = 'online' as const

export const RedisKeys = {
  lock: (key: string | number): CacheKey<string> => `${REDIS_PREFIX}:lock:${key}` as const,
} as const
