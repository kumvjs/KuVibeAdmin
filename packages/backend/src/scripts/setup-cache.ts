import { Redis } from 'ioredis'
import { authKeys } from '../shared/cache/keys/auth.keys.js'

export async function clearSetupPermissions(userIds: string[]): Promise<void> {
  if (!userIds.length)
    return
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 5000,
  })
  try {
    await redis.connect()
    for (let offset = 0; offset < userIds.length; offset += 500)
      await redis.del(...userIds.slice(offset, offset + 500).map(id => authKeys.userPermissions(id)))
  }
  finally {
    redis.disconnect()
  }
}
