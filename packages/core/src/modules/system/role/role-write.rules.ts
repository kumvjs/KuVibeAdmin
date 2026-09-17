import type { CreateRoleDto } from './dto/create-role.dto.js'
import type { UpdateRoleDto } from './dto/update-role.dto.js'
import type { SysRoleEntity } from './entities/role.entity.js'
import { UnprocessableEntityException } from '@nestjs/common'
import { Roles } from '#/modules/auth/auth.constant.js'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'
import { RoleStatus } from './role.types.js'

export interface RoleWriteState {
  code: string
  name: string
  remark: string | null
  status: RoleStatus
}

const POSTGRES_BIGINT_MAX = BigInt('9223372036854775807')
const CODE_PATTERN = /^[a-z][a-z0-9:_-]*$/
const RESERVED_CODES = new Set<string>(Object.values(Roles))

function hasOwn(value: object, key: PropertyKey): boolean {
  return hasSubmittedField(value, key)
}

function invalid(message: string): never {
  throw new UnprocessableEntityException(message)
}

function assertBigintId(value: string, field: string): void {
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > POSTGRES_BIGINT_MAX)
    invalid(`${field} 必须是 PostgreSQL bigint 范围内的正整数字符串`)
}

export function assertRoleId(value: string): void {
  assertBigintId(value, 'id')
}

export function assertPublicRoleCode(code: string): void {
  if (RESERVED_CODES.has(code))
    invalid('code 是系统保留角色标识')
}

export function buildRoleWriteState(
  dto: CreateRoleDto | UpdateRoleDto,
  current?: SysRoleEntity,
  generatedCode?: string,
): RoleWriteState {
  const submittedCode = !current && hasOwn(dto, 'code')
    ? (dto as CreateRoleDto).code
    : undefined
  const code = current?.code ?? submittedCode ?? generatedCode
  const name = hasOwn(dto, 'name') ? dto.name : current?.name
  const status = hasOwn(dto, 'status') ? dto.status : current?.status

  if (typeof code !== 'string' || code.length < 2 || code.length > 64 || !CODE_PATTERN.test(code))
    invalid('code 必须是 2 到 64 个字符且符合角色标识格式')
  if (
    typeof name !== 'string'
    || name.length < 1
    || name.length > 50
    || !/^\S(?:.*\S)?$/u.test(name)
  ) {
    invalid('name 必须是 1 到 50 个字符且首尾无空白的字符串')
  }
  if (status !== RoleStatus.DISABLED && status !== RoleStatus.ENABLED)
    invalid('status 必须是 0 或 1')

  let remark = hasOwn(dto, 'remark') ? dto.remark : current?.remark ?? null
  if (remark === undefined || remark === null || remark === '') {
    remark = null
  }
  else if (typeof remark !== 'string' || remark.length > 255) {
    invalid('remark 必须是不超过 255 个字符的字符串')
  }

  return { code, name, remark, status }
}

export function normalizePermissionIds(value: unknown): string[] {
  if (value === undefined || value === null)
    return []
  if (!Array.isArray(value) || value.length > 1_000)
    invalid('permissions 必须是不超过 1000 项的菜单 ID 数组')

  const ids = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string')
      invalid('permissions 中的 ID 必须是字符串')
    assertBigintId(item, 'permissions 中的 ID')
    ids.add(item)
  }

  return [...ids].sort((left, right) => {
    const leftId = BigInt(left)
    const rightId = BigInt(right)
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
  })
}
