import { ConfigType, registerAs } from '@nestjs/config'

export const redisRegToken = 'redis'

export const REDIS_CONFIG = registerAs(redisRegToken, () => ({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  db: Number(process.env.REDIS_DB),
}))

export type RedisConfig = ConfigType<typeof REDIS_CONFIG>
