// keys/user.keys.ts

import { SysUserEntity } from '#/modules/user/entities/user.entity.js'

const USER_KEY_PREFIX = 'user' as const

export const userKeys = {
  info: (userId: string): CacheKey<SysUserEntity> => `${USER_KEY_PREFIX}:info:${userId}`,
} as const
