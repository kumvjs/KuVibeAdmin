// keys/auth.keys.ts

const AUTH_KEY_PREFIX = 'auth' as const

export const USER_PERMISSIONS_CACHE_SCHEMA_VERSION = 1 as const

export interface UserPermissionsCacheValue {
  codes: string[]
  schemaVersion: typeof USER_PERMISSIONS_CACHE_SCHEMA_VERSION
}

export const authKeys = {
  userToken: (userId: string | number): CacheKey<string> => `${AUTH_KEY_PREFIX}:user:tokens:${userId}` as const,
  userTokens: (userId: string | number, jwtUuid: string): CacheKey<string> => `${AUTH_KEY_PREFIX}:user:tokens:${userId}:${jwtUuid}` as const,
  userTokensPrefix: (userId: string | number): string => `${AUTH_KEY_PREFIX}:user:tokens:${userId}:`,
  accessToken: (jwtUuid: string): CacheKey<string> => `${AUTH_KEY_PREFIX}:token:access:${jwtUuid}` as const,
  userRefreshTokens: (userId: string | number, jwtUuid: string): CacheKey<string> => `${AUTH_KEY_PREFIX}:user:refresh_tokens:${userId}:${jwtUuid}` as const,
  userRefreshTokensPrefix: (userId: string | number): string => `${AUTH_KEY_PREFIX}:user:refresh_tokens:${userId}:`,
  tokenBlacklist: (jwtUuid: string): CacheKey<string> => `${AUTH_KEY_PREFIX}:token:blacklist:${jwtUuid}` as CacheKey<string>,
  captcha: (id: string): CacheKey<string> => `${AUTH_KEY_PREFIX}:captcha:${id}` as const,
  passwordVersion: (userId: string | number): CacheKey<number> => `${AUTH_KEY_PREFIX}:user:password_version:${userId}` as const,
  userPermissions: (userId: string | number): CacheKey<UserPermissionsCacheValue> => `${AUTH_KEY_PREFIX}:user:permissions:${userId}` as const,
} as const
