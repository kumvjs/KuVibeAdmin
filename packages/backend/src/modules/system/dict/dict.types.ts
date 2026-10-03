export enum DictStatus {
  DISABLED = 0,
  ENABLED = 1,
}

export const DICT_PERMISSIONS = {
  CREATE: 'system:dict:create',
  LIST: 'system:dict:list',
  UPDATE: 'system:dict:update',
  DISABLE: 'system:dict:disable',
} as const

export const DICT_MAX_DEPTH = 32
export const DICT_MAX_RESULT_NODES = 10_000
