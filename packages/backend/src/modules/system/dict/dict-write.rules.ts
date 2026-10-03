import type { CreateDictDto, UpdateDictDto } from './dto/dict.dto.js'
import type { SysDictEntity } from './entities/dict.entity.js'
import { ConflictException, UnprocessableEntityException } from '@nestjs/common'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'

export function assertDictId(value: string, allowZero = false): void {
  if (typeof value !== 'string' || !(allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/).test(value)
    || value.length > 19 || BigInt(value) > 9_223_372_036_854_775_807n) {
    throw new UnprocessableEntityException('字典 ID 必须是 PostgreSQL bigint 范围内的整数字符串')
  }
}
export function buildDictWriteState(dto: CreateDictDto | UpdateDictDto, current?: SysDictEntity) {
  const input = dto as CreateDictDto
  const field = <K extends keyof CreateDictDto>(key: K, fallback: unknown) => hasSubmittedField(input, key) ? input[key] : fallback
  const name = field('name', current?.name)
  const code = field('code', current?.code)
  const order = field('order', current?.order ?? 0)
  const cacheEnabled = field('cacheEnabled', current?.cacheEnabled ?? false)
  let pid = field('pid', current?.pid ?? null)
  const value = field('value', current?.value ?? null)
  const remark = field('remark', current?.remark ?? null)
  if (typeof name !== 'string' || name.length < 1 || name.length > 100 || name.trim() !== name)
    throw new UnprocessableEntityException('名称须为 1 到 100 个字符且首尾无空白')
  if (typeof code !== 'string' || code.length > 100 || !/^[a-z][a-z0-9_.-]*$/.test(code))
    throw new UnprocessableEntityException('编码无效')
  if (current && code !== current.code)
    throw new ConflictException('字典编码创建后不可修改')
  if (current && current.value !== null && value !== current.value)
    throw new ConflictException('已设置的业务值不能修改，请停用并新建节点')
  if (typeof cacheEnabled !== 'boolean')
    throw new UnprocessableEntityException('cacheEnabled 必须为布尔值')
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 0 || order > 2_147_483_647)
    throw new UnprocessableEntityException('order 必须是 0 到 2147483647 的整数')
  if (pid !== null) {
    assertDictId(pid as string, true)
    if (pid === '0')
      pid = null
  }
  if (value !== null && (typeof value !== 'string' || value.length > 1000))
    throw new UnprocessableEntityException('value 必须是最长 1000 的字符串或 null')
  if (remark !== null && (typeof remark !== 'string' || remark.length > 500))
    throw new UnprocessableEntityException('remark 必须是最长 500 的字符串或 null')
  return { name, code, order, cacheEnabled, pid: pid as string | null, value: value as string | null, remark: remark as string | null }
}
