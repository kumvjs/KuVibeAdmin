import type { DictResponseDto } from './dto/dict.dto.js'
import type { SysDictEntity } from './entities/dict.entity.js'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { dictTree, flattenDictTree } from './dict-tree.js'
import { assertDictId, buildDictWriteState } from './dict-write.rules.js'
import { CreateDictDto, DictListQueryDto, UpdateDictDto } from './dto/dict.dto.js'

describe('统一树字典边界', () => {
  it('区分未提交、显式 null 及空字符串，路径不作为写入来源', () => {
    const current = { name: '状态', code: 'status', pid: '9007199254740993', value: '1', remark: '原备注', order: 7, status: 1 } as SysDictEntity
    expect(buildDictWriteState(new UpdateDictDto(), current)).toEqual({ name: '状态', code: 'status', pid: '9007199254740993', value: '1', remark: '原备注', order: 7, status: 1 })
    expect(buildDictWriteState(Object.assign(new UpdateDictDto(), { value: '', remark: null, pid: null }), current)).toMatchObject({ value: '', remark: null, pid: null })
    expect(buildDictWriteState({ name: '根', code: 'root', pid: '0' })).toEqual({ name: '根', code: 'root', pid: null, value: null, remark: null, order: 0, status: 1 })
    for (const field of ['name', 'code', 'order', 'status'])
      expect(() => buildDictWriteState({ [field]: null }, current)).toThrow()
  })

  it('拒绝超过 bigint 范围及浮点/数字 ID，允许超过 JS 安全整数的字符串', () => {
    expect(() => assertDictId('9007199254740993')).not.toThrow()
    expect(() => assertDictId('9223372036854775807')).not.toThrow()
    for (const id of ['0', '01', '-1', '1.5', '9223372036854775808', '9'.repeat(100), 1])
      expect(() => assertDictId(id as string)).toThrow()
  })

  it('严格解析布尔查询，false 不会转为 true，非法字面量被拒', async () => {
    const dto = plainToInstance(DictListQueryDto, { enabledOnly: 'false', includeSelf: 'true', format: 'flat' })
    expect(dto.enabledOnly).toBe(false)
    expect(dto.includeSelf).toBe(true)
    expect(await validate(dto)).toEqual([])
    const invalid = plainToInstance(DictListQueryDto, { enabledOnly: '0', includeSelf: 'yes', rootId: '1.0' })
    expect((await validate(invalid)).map(error => error.property)).toEqual(expect.arrayContaining(['enabledOnly', 'includeSelf', 'rootId']))
  })

  it('dTO 拒绝空编码、空名称、首尾空白及负排序', async () => {
    const dto = plainToInstance(CreateDictDto, { name: ' 状态 ', code: '', order: -1 })
    expect((await validate(dto)).map(error => error.property)).toEqual(expect.arrayContaining(['name', 'code', 'order']))
    expect(await validate(plainToInstance(UpdateDictDto, { pid: null, value: null, remark: null }))).toEqual([])
  })

  it('一万层组装/展开不依赖调用栈，并按数字 bigint 排序', () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({ id: String(i + 1), pid: i === 0 ? null : String(i), order: 0 }) as DictResponseDto)
    const tree = dictTree(rows)
    expect(flattenDictTree(tree).map(row => row.id)).toEqual(rows.map(row => row.id))
    expect(flattenDictTree(tree)[0]).not.toHaveProperty('children')
    const siblings = dictTree([
      { id: '9007199254740994', pid: null, order: 0 },
      { id: '9007199254740993', pid: null, order: 0 },
      { id: '1', pid: null, order: 1 },
    ] as DictResponseDto[])
    expect(siblings.map(node => node.id)).toEqual(['9007199254740993', '9007199254740994', '1'])
  })
})
