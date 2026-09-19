const WS_UID_KEY_PREFIX = 'wsUid' as const

export const wsUidKeys = {
  user: (userId: string) => `${WS_UID_KEY_PREFIX}:user:${userId}` as const,

} as const
