export enum RoleStatus {
  DISABLED = 0,
  ENABLED = 1,
}

export const ROLE_PERMISSIONS = {
  CREATE: 'system:role:create',
  DELETE: 'system:role:delete',
  LIST: 'system:role:list',
  UPDATE: 'system:role:update',
} as const
