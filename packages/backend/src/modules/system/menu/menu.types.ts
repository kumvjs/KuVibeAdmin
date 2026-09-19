export type MenuMetaValue
  = | boolean
    | MenuMetaValue[]
    | null
    | number
    | string
    | { [key: string]: MenuMetaValue }

/** Vben v5.7.0 route metadata stored directly as JSONB. */
export interface MenuMeta {
  [key: string]: MenuMetaValue | undefined
  activeIcon?: string
  activePath?: string
  affixTab?: boolean
  affixTabOrder?: number
  authority?: string[]
  badge?: string
  badgeType?: 'dot' | 'normal'
  badgeVariants?: string
  hideChildrenInMenu?: boolean
  hideInBreadcrumb?: boolean
  hideInMenu?: boolean
  hideInTab?: boolean
  icon?: string
  iframeSrc?: string
  keepAlive?: boolean
  link?: string
  maxNumOfOpenTab?: number
  noBasicLayout?: boolean
  openInNewWindow?: boolean
  order?: number
  query?: { [key: string]: MenuMetaValue }
  title?: string
}

export enum MenuStatus {
  DISABLED = 0,
  ENABLED = 1,
}

export enum MenuType {
  BUTTON = 'button',
  CATALOG = 'catalog',
  EMBEDDED = 'embedded',
  LINK = 'link',
  MENU = 'menu',
}

export const MENU_PERMISSIONS = {
  CREATE: 'system:menu:create',
  DELETE: 'system:menu:delete',
  LIST: 'system:menu:list',
  UPDATE: 'system:menu:update',
} as const
