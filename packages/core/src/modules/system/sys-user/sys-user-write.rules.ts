import type { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import type { CreateSysUserDto } from './dto/create-sys-user.dto.js'
import type { UpdateSysUserDto } from './dto/update-sys-user.dto.js'
import { UnprocessableEntityException } from '@nestjs/common'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'
import { isIanaTimezone } from '#/utils/time.util.js'
import { UserStatus } from './sys-user.types.js'

export interface SysUserWriteState {
  avatar: string | null
  deptId: string
  description: string | null
  homePath: string | null
  name: string
  remark: string | null
  status: UserStatus
  timezone: string | null
  username: string
}

const POSTGRES_BIGINT_MAX = BigInt('9223372036854775807')
const USERNAME_PATTERN = /^[a-z\d][\w.-]*$/i

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

function nullableString(
  value: unknown,
  field: string,
  maxLength: number,
  current?: string | null,
): string | null {
  const nextValue = value === undefined ? current ?? null : value
  if (nextValue === null || nextValue === '')
    return null
  if (typeof nextValue !== 'string' || nextValue.length > maxLength)
    invalid(`${field} 必须是不超过 ${maxLength} 个字符的字符串`)
  return nextValue
}

export function assertSysUserId(value: string): void {
  assertBigintId(value, 'id')
}

export function assertPassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    invalid('password 必须是 12 到 128 个字符的字符串')
}

export function normalizeRoleIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    invalid('roleIds 必须是 1 到 100 项的角色 ID 数组')

  const ids = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string')
      invalid('roleIds 中的 ID 必须是字符串')
    assertBigintId(item, 'roleIds 中的 ID')
    if (ids.has(item))
      invalid('roleIds 不能包含重复 ID')
    ids.add(item)
  }

  return [...ids].sort((left, right) => {
    const leftId = BigInt(left)
    const rightId = BigInt(right)
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
  })
}

export function buildSysUserWriteState(
  dto: CreateSysUserDto | UpdateSysUserDto,
  current?: SysUserEntity,
): SysUserWriteState {
  const username = current?.username ?? (dto as CreateSysUserDto).username
  const name = hasOwn(dto, 'name') ? dto.name : current?.name
  const deptId = hasOwn(dto, 'deptId') ? dto.deptId : current?.deptId
  const status = hasOwn(dto, 'status') ? dto.status : current?.status

  if (typeof username !== 'string' || username.length < 4 || username.length > 100 || !USERNAME_PATTERN.test(username))
    invalid('username 必须是 4 到 100 个字符且符合登录账号格式')
  if (typeof name !== 'string' || name.length < 1 || name.length > 100 || !/^\S(?:.*\S)?$/u.test(name))
    invalid('name 必须是 1 到 100 个字符且首尾无空白的字符串')
  if (typeof deptId !== 'string')
    invalid('deptId 是必填的部门 ID')
  assertBigintId(deptId, 'deptId')
  if (status !== UserStatus.DISABLED && status !== UserStatus.ENABLED)
    invalid('status 必须是 0 或 1')

  const homePath = nullableString(dto.homePath, 'homePath', 255, current?.homePath)
  if (homePath && (!homePath.startsWith('/') || /\s/u.test(homePath)))
    invalid('homePath 必须是以 / 开头且不包含空白的路径')

  const avatar = nullableString(dto.avatar, 'avatar', 500, current?.avatar)
  if (avatar !== current?.avatar && avatar && /\/attachments\/[1-9]\d*\/(?:public|content)(?:[?#]|$)/.test(avatar))
    invalid('系统附件头像必须通过头像绑定接口设置，不能直接写入下载 URL')

  const timezone = dto.timezone === undefined ? current?.timezone ?? null : dto.timezone
  if (timezone !== null && !isIanaTimezone(timezone))
    invalid('timezone 必须是 IANA 时区或 null')

  return {
    avatar,
    deptId,
    description: nullableString(dto.description, 'description', 500, current?.description),
    homePath,
    name,
    remark: nullableString(dto.remark, 'remark', 255, current?.remark),
    status,
    timezone,
    username,
  }
}
