import type { ValidationArguments, ValidationOptions } from 'class-validator'
import { registerDecorator } from 'class-validator'

const STRING_FIELDS = new Set([
  'activeIcon',
  'activePath',
  'badge',
  'badgeVariants',
  'icon',
  'iframeSrc',
  'link',
  'title',
])
const BOOLEAN_FIELDS = new Set([
  'affixTab',
  'hideChildrenInMenu',
  'hideInBreadcrumb',
  'hideInMenu',
  'hideInTab',
  'keepAlive',
  'noBasicLayout',
  'openInNewWindow',
])
const NUMBER_FIELDS = new Set(['affixTabOrder', 'maxNumOfOpenTab', 'order'])
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 10)
    return false
  if (value === null || ['boolean', 'string'].includes(typeof value))
    return true
  if (typeof value === 'number')
    return Number.isFinite(value)
  if (Array.isArray(value))
    return value.every(item => isJsonValue(item, depth + 1))
  if (!isPlainObject(value))
    return false

  return Object.entries(value).every(([key, item]) => (
    !FORBIDDEN_KEYS.has(key) && isJsonValue(item, depth + 1)
  ))
}

export function isVbenMenuMeta(value: unknown): boolean {
  if (!isPlainObject(value) || !isJsonValue(value))
    return false

  for (const [key, item] of Object.entries(value)) {
    if (STRING_FIELDS.has(key) && (typeof item !== 'string' || item.length > 2_048))
      return false
    if (BOOLEAN_FIELDS.has(key) && typeof item !== 'boolean')
      return false
    if (
      NUMBER_FIELDS.has(key)
      && (typeof item !== 'number' || !Number.isSafeInteger(item) || (key === 'maxNumOfOpenTab' && item < 0))
    ) {
      return false
    }
  }

  if (value.badgeType !== undefined && !['dot', 'normal'].includes(String(value.badgeType)))
    return false
  if (
    value.badgeVariants !== undefined
    && !['default', 'destructive', 'primary', 'success', 'warning'].includes(String(value.badgeVariants))
  ) {
    return false
  }
  if (
    value.authority !== undefined
    && (!Array.isArray(value.authority)
      || !value.authority.every(item => typeof item === 'string' && item.length > 0 && item.length <= 255))
  ) {
    return false
  }
  if (value.query !== undefined && !isPlainObject(value.query))
    return false

  return true
}

export function IsVbenMenuMeta(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isVbenMenuMeta',
      target: target.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        defaultMessage(args: ValidationArguments) {
          return `${args.property} 必须是有效且类型正确的 Vben 菜单元数据`
        },
        validate: isVbenMenuMeta,
      },
    })
  }
}
