export enum DictStatus {
  DISABLED = 0,
  ENABLED = 1,
}

export const DICT_PERMISSIONS = {
  CREATE: 'system:dict:create',
  DELETE: 'system:dict:delete',
  LIST: 'system:dict:list',
  UPDATE: 'system:dict:update',
} as const
