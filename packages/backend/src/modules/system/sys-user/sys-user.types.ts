export enum UserStatus {
  DISABLED = 0,
  ENABLED = 1,
}

export enum PasswordAlgorithm {
  ARGON2ID = 'argon2id',
}

export const SYS_USER_PERMISSIONS = {
  CREATE: 'system:user:create',
  DELETE: 'system:user:delete',
  LIST: 'system:user:list',
  UPDATE: 'system:user:update',
} as const
