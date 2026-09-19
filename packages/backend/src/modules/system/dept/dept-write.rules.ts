import type { CreateDeptDto } from './dto/create-dept.dto.js'
import type { UpdateDeptDto } from './dto/update-dept.dto.js'
import type { SysDeptEntity } from './entities/dept.entity.js'
import { UnprocessableEntityException } from '@nestjs/common'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'
import { DeptStatus } from './dept.types.js'

export interface DeptWriteState {
  name: string
  order: number
  pid: string | null
  remark: string | null
  status: DeptStatus
}

const POSTGRES_BIGINT_MAX = BigInt('9223372036854775807')
const MAX_ORDER = 2_147_483_647

function hasOwn(value: object, key: PropertyKey): boolean {
  return hasSubmittedField(value, key)
}

function invalid(message: string): never {
  throw new UnprocessableEntityException(message)
}

function assertBigintId(value: string, field: string, allowZero = false): void {
  const pattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/
  if (!pattern.test(value) || BigInt(value) > POSTGRES_BIGINT_MAX)
    invalid(`${field} 必须是 PostgreSQL bigint 范围内的${allowZero ? '非负' : '正'}整数字符串`)
}

export function assertDeptId(value: string): void {
  assertBigintId(value, 'id')
}

export function buildDeptWriteState(
  dto: CreateDeptDto | UpdateDeptDto,
  current?: SysDeptEntity,
): DeptWriteState {
  const name = hasOwn(dto, 'name') ? dto.name : current?.name
  const status = hasOwn(dto, 'status') ? dto.status : current?.status
  const order = hasOwn(dto, 'order') ? dto.order : current?.order ?? 0

  if (
    typeof name !== 'string'
    || name.length < 2
    || name.length > 20
    || !/^\S(?:.*\S)?$/u.test(name)
  ) {
    invalid('name 必须是 2 到 20 个字符且首尾无空白的字符串')
  }
  if (status !== DeptStatus.DISABLED && status !== DeptStatus.ENABLED)
    invalid('status 必须是 0 或 1')
  if (!Number.isInteger(order) || (order as number) < 0 || (order as number) > MAX_ORDER)
    invalid(`order 必须是 0 到 ${MAX_ORDER} 的整数`)

  let pid = hasOwn(dto, 'pid') ? dto.pid : current?.pid ?? null
  if (pid === undefined || pid === null || pid === '') {
    pid = null
  }
  else {
    if (typeof pid !== 'string')
      invalid('pid 必须是字符串')
    assertBigintId(pid, 'pid', true)
    if (pid === '0')
      pid = null
  }

  let remark = hasOwn(dto, 'remark') ? dto.remark : current?.remark ?? null
  if (remark === undefined || remark === null || remark === '') {
    remark = null
  }
  else if (typeof remark !== 'string' || remark.length > 50) {
    invalid('remark 必须是不超过 50 个字符的字符串')
  }

  return {
    name,
    order: order as number,
    pid,
    remark,
    status: status as DeptStatus,
  }
}
