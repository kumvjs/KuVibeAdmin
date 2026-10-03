import type { DictResponseDto } from './dto/dict.dto.js'
import type { SysDictEntity } from './entities/dict.entity.js'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { formatDictRows } from './dict-format.js'
import { DictReadGuard } from './dict-read.guard.js'
import { assertDictId, buildDictWriteState } from './dict-write.rules.js'
import { CreateDictDto, DictSubtreeQueryDto, UpdateDictDto } from './dto/dict.dto.js'

const current = { name: '状态', code: 'status', pid: null, value: '0', remark: '备注', order: 7, cacheEnabled: true } as SysDictEntity

describe('邻接树字典新业务模型', () => {
  it('区分未提交/显式 null，编码及已设置业务值不可改写', () => {
    expect(buildDictWriteState(new UpdateDictDto(), current)).toMatchObject({ value: '0', cacheEnabled: true, remark: '备注' })
    expect(buildDictWriteState({ remark: null, pid: null, cacheEnabled: false }, current)).toMatchObject({ remark: null, cacheEnabled: false })
    expect(() => buildDictWriteState({ code: 'new' } as CreateDictDto, current)).toThrow('编码')
    expect(() => buildDictWriteState({ value: null }, current)).toThrow('业务值')
    for (const value of [null, '', '0', 'valid'])
      expect(buildDictWriteState({ name: '节点', code: 'node', value }).value).toBe(value)
    for (const field of ['name', 'order', 'cacheEnabled'])
      expect(() => buildDictWriteState({ [field]: null }, current)).toThrow()
  })

  it('bigint ID 保持字符串且拒绝溢出、数字与浮点', () => {
    expect(() => assertDictId('9007199254740993')).not.toThrow()
    for (const id of ['0', '01', '1.5', '9223372036854775808', 1])
      expect(() => assertDictId(id as string)).toThrow()
  })

  it('严格解析布尔，空字符串值与 cacheEnabled DTO 可用，更新无编码字段', async () => {
    expect(await validate(plainToInstance(CreateDictDto, { name: '节点', code: 'node', value: '', cacheEnabled: true }))).toEqual([])
    const query = plainToInstance(DictSubtreeQueryDto, { enabledOnly: 'false', includeSelf: 'true' })
    expect(query.enabledOnly).toBe(false)
    expect(query.includeSelf).toBe(true)
    expect(await validate(query)).toEqual([])
    expect((await validate(plainToInstance(DictSubtreeQueryDto, { includeSelf: 'yes' }))).length).toBeGreaterThan(0)
  })

  it('组树/flat 保持排序、大 ID、value 非叶子和停用传播，不保存路径', () => {
    const rows = [
      { id: '9007199254740993', pid: null, status: 0, value: 'root' },
      { id: '2', pid: '9007199254740993', status: 1, value: '' },
      { id: '3', pid: '2', status: 1, value: null },
    ] as DictResponseDto[]
    const flat = formatDictRows(rows, 'flat', true)
    expect(flat.map(row => row.id)).toEqual(['9007199254740993', '2', '3'])
    expect(flat.map(row => row.effectiveStatus)).toEqual([0, 0, 0])
    expect(flat[0]).not.toHaveProperty('pathIds')
    expect(flat[0]).not.toHaveProperty('children')
    expect(formatDictRows(rows, 'tree', true)[0].children?.[0].value).toBe('')
    expect(() => formatDictRows([{ id: '1', pid: '2' }, { id: '2', pid: '1' }] as DictResponseDto[], 'tree')).toThrow('循环')
  })

  it('业务读取守卫按用户限流，未登录拒绝，不共享用户窗口', () => {
    const guard = new DictReadGuard()
    const context = (uid?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user: uid ? { uid } : undefined }) }) }) as never
    expect(() => guard.canActivate(context())).toThrow('登录')
    for (let index = 0; index < 120; index++) expect(guard.canActivate(context('1'))).toBe(true)
    expect(() => guard.canActivate(context('1'))).toThrow('频繁')
    expect(guard.canActivate(context('2'))).toBe(true)
  })
})
