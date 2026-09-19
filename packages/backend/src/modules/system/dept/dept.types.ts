export enum DeptStatus {
  DISABLED = 0,
  ENABLED = 1,
}

export const DEPT_PERMISSIONS = {
  CREATE: 'system:dept:create',
  DELETE: 'system:dept:delete',
  LIST: 'system:dept:list',
  UPDATE: 'system:dept:update',
} as const
