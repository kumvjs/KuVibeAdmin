import type { CreateMenuDto } from './dto/create-menu.dto.js'
import type { UpdateMenuDto } from './dto/update-menu.dto.js'
import type { SysMenuEntity } from './entities/menu.entity.js'
import type { MenuMeta } from './menu.types.js'
import { UnprocessableEntityException } from '@nestjs/common'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'
import { isVbenMenuMeta } from './dto/is-vben-menu-meta.decorator.js'
import { MenuStatus, MenuType } from './menu.types.js'

export interface MenuWriteState {
  authCode: string | null
  component: string | null
  meta: MenuMeta
  name: string
  path: string | null
  pid: string | null
  redirect: string | null
  status: MenuStatus
  type: MenuType
}

const POSTGRES_BIGINT_MAX = BigInt('9223372036854775807')
const PATH_PATTERN = /^\/(?!\/)[^\s?#\\]+$/
const AUTH_CODE_PATTERN = /^[a-z][\w-]*(?::[a-z][\w-]*)+$/i
const COMPONENT_PATTERN = /^(?!\/\/)[\w@./-]+$/

function hasOwn(value: object, key: PropertyKey): boolean {
  return hasSubmittedField(value, key)
}

function invalid(message: string): never {
  throw new UnprocessableEntityException(message)
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '')
    return null
  if (typeof value !== 'string')
    invalid(`${field} 必须是字符串`)
  if (value !== value.trim())
    invalid(`${field} 首尾不得包含空白字符`)
  return value
}

function resolveOptionalString(
  dto: CreateMenuDto | UpdateMenuDto,
  current: SysMenuEntity | undefined,
  field: 'authCode' | 'component' | 'path' | 'redirect',
): string | null {
  if (hasOwn(dto, field))
    return optionalString(dto[field], field)
  return current?.[field] ?? null
}

function assertBigintId(value: string, field: string, allowZero = false): void {
  const pattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/
  if (!pattern.test(value) || BigInt(value) > POSTGRES_BIGINT_MAX)
    invalid(`${field} 必须是 PostgreSQL bigint 范围内的${allowZero ? '非负' : '正'}整数字符串`)
}

function assertPath(value: string, field: string): void {
  if (value.length < 2 || value.length > 100 || !PATH_PATTERN.test(value))
    invalid(`${field} 必须是以单个 / 开头、不含空白、查询串、片段或反斜杠的路由路径`)
}

function assertComponent(value: string): void {
  if (
    value.length > 255
    || !COMPONENT_PATTERN.test(value)
    || value.split('/').includes('..')
  ) {
    invalid('component 必须是安全的前端组件标识或路径')
  }
}

function assertHttpUrl(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 2_048)
    invalid(`${field} 必须是有效的 HTTP(S) URL`)

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      invalid(`${field} 必须是不含用户凭据的 HTTP(S) URL`)
  }
  catch {
    invalid(`${field} 必须是有效的 HTTP(S) URL`)
  }
}

function normalizeMeta(
  dto: CreateMenuDto | UpdateMenuDto,
  current: SysMenuEntity | undefined,
  type: MenuType,
): MenuMeta {
  const submittedMeta = hasOwn(dto, 'meta') ? dto.meta : undefined
  if (submittedMeta !== undefined && !isVbenMenuMeta(submittedMeta))
    invalid('meta 必须是有效且类型正确的 Vben 菜单元数据')

  const meta: MenuMeta = {
    ...(current?.meta ?? {}),
    ...(submittedMeta ?? {}),
  }

  if (hasOwn(dto, 'activePath')) {
    const activePath = optionalString(dto.activePath, 'activePath')
    if (activePath)
      meta.activePath = activePath
    else
      delete meta.activePath
  }

  if (hasOwn(dto, 'linkSrc')) {
    const linkSrc = optionalString(dto.linkSrc, 'linkSrc')
    if (![MenuType.EMBEDDED, MenuType.LINK].includes(type))
      invalid('linkSrc 仅适用于 embedded 或 link 菜单')
    if (type === MenuType.EMBEDDED) {
      if (linkSrc)
        meta.iframeSrc = linkSrc
      else
        delete meta.iframeSrc
    }
    else {
      if (linkSrc)
        meta.link = linkSrc
      else
        delete meta.link
    }
  }

  if (typeof meta.title !== 'string' || !meta.title.trim() || meta.title !== meta.title.trim() || meta.title.length > 255)
    invalid('meta.title 必须是 1 到 255 个字符且首尾无空白的字符串')

  if (type !== MenuType.EMBEDDED)
    delete meta.iframeSrc
  if (type !== MenuType.LINK)
    delete meta.link
  if (![MenuType.EMBEDDED, MenuType.MENU].includes(type))
    delete meta.activePath

  if (!isVbenMenuMeta(meta))
    invalid('meta 必须是有效且类型正确的 Vben 菜单元数据')

  if (meta.activePath !== undefined)
    assertPath(meta.activePath, 'activePath')
  if (type === MenuType.EMBEDDED)
    assertHttpUrl(meta.iframeSrc, 'meta.iframeSrc')
  if (type === MenuType.LINK)
    assertHttpUrl(meta.link, 'meta.link')

  return meta
}

export function buildMenuWriteState(
  dto: CreateMenuDto | UpdateMenuDto,
  current?: SysMenuEntity,
): MenuWriteState {
  const type = hasOwn(dto, 'type') ? dto.type : current?.type
  const status = hasOwn(dto, 'status') ? dto.status : current?.status
  const name = hasOwn(dto, 'name') ? dto.name : current?.name

  if (!Object.values(MenuType).includes(type as MenuType))
    invalid('type 必须是有效的 Vben 菜单类型')
  if (!Object.values(MenuStatus).includes(status as MenuStatus))
    invalid('status 必须是 0 或 1')
  if (typeof name !== 'string' || name.length < 2 || name.length > 30 || !/^\S+$/.test(name))
    invalid('name 必须是 2 到 30 个不含空白的字符')

  let pid = hasOwn(dto, 'pid') ? optionalString(dto.pid, 'pid') : current?.pid ?? null
  if (pid) {
    assertBigintId(pid, 'pid', true)
    if (pid === '0')
      pid = null
  }

  let authCode = resolveOptionalString(dto, current, 'authCode')
  let component = resolveOptionalString(dto, current, 'component')
  let path = resolveOptionalString(dto, current, 'path')
  let redirect = resolveOptionalString(dto, current, 'redirect')
  const meta = normalizeMeta(dto, current, type as MenuType)

  if (path)
    assertPath(path, 'path')
  if (redirect)
    assertPath(redirect, 'redirect')
  if (component)
    assertComponent(component)
  if (authCode && (authCode.length > 255 || !AUTH_CODE_PATTERN.test(authCode)))
    invalid('authCode 必须是以冒号分段的权限码')

  switch (type) {
    case MenuType.BUTTON:
      if (!pid)
        invalid('button 菜单必须指定父级')
      if (!authCode)
        invalid('button 菜单必须指定 authCode')
      path = null
      component = null
      redirect = null
      break
    case MenuType.CATALOG:
      if (!path)
        invalid('catalog 菜单必须指定 path')
      break
    case MenuType.EMBEDDED:
      if (!path)
        invalid('embedded 菜单必须指定 path')
      redirect = null
      break
    case MenuType.LINK:
      authCode = null
      redirect = null
      break
    case MenuType.MENU:
      if (!path)
        invalid('menu 菜单必须指定 path')
      if (!component)
        invalid('menu 菜单必须指定 component')
      break
  }

  return {
    authCode,
    component,
    meta,
    name,
    path,
    pid,
    redirect,
    status: status as MenuStatus,
    type: type as MenuType,
  }
}

export function assertMenuId(value: string): void {
  assertBigintId(value, 'id')
}

export function isParentCapable(type: MenuType): boolean {
  return [MenuType.CATALOG, MenuType.MENU].includes(type)
}
