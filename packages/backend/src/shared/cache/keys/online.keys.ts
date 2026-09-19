const ONLINE_KEY_PREFIX = 'online' as const

export const onlineKeys = {
  user: (userId: string): CacheKey<string> => `${ONLINE_KEY_PREFIX}:user:${userId}` as const,
} as const
