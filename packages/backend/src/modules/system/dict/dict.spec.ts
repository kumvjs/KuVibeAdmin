import type { DictCacheRow } from './dict-cache.types.js'
import type { DictResponseDto } from './dto/dict.dto.js'
import type { SysDictEntity } from './entities/dict.entity.js'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { buildDictScope, dictTree, flattenDictTree, flattenScopedRows } from './dict-tree.js'
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

function cached(id: string, pid: string | null, pathIds: string[], extra: Partial<DictCacheRow> = {}): DictCacheRow {
  return {
    id,
    pid,
    name: `节点${id}`,
    code: `test.node_${id}`,
    value: null,
    status: 1,
    order: 0,
    remark: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    pathIds,
    pathNames: pathIds.map(item => `节点${item}`),
    ...extra,
  }
}

describe('字典缓存行范围裁剪', () => {
  const fixture = (): DictCacheRow[] => [
    cached('1', null, ['1']),
    cached('2', '1', ['1', '2'], { order: 1 }),
    cached('3', '2', ['1', '2', '3']),
    cached('4', '1', ['1', '4'], { order: 0 }),
    cached('9', null, ['9'], { order: -1 }),
  ]

  it('按 order 与数字 bigint 排序，并按路径长度派生绝对层级', () => {
    const build = buildDictScope(fixture(), null, true, false)
    expect(flattenScopedRows(build).map(row => row.id)).toEqual(['9', '1', '4', '2', '3'])
    expect(build.rows.find(row => row.id === '3')?.depth).toBe(3)
    expect(build.rows.find(row => row.id === '3')?.enabled).toBe(true)
  })

  it('定点查询只返回该范围子树：includeSelf 决定是否含根，平铺结果不含 children', () => {
    const build = buildDictScope(fixture(), '2', true, false)
    expect(flattenScopedRows(build).map(row => row.id)).toEqual(['2', '3'])
    const excluded = buildDictScope(fixture(), '2', false, false)
    // 不含范围根时只接受其直接下级，与 DictService.list 的 listChildren 语义一致。
    const children = excluded.rows.filter(row => row.pid === '2')
    expect(children.map(row => row.id)).toEqual(['3'])
    expect(flattenScopedRows({ ...excluded, rows: children }).map(row => row.id)).toEqual(['3'])
  })

  it('停用节点自身与后代全部被 enabledOnly 裁剪，未过滤时仍带 enabled 标记', () => {
    const rows = [
      cached('1', null, ['1']),
      cached('2', '1', ['1', '2'], { status: 0 }),
      cached('3', '2', ['1', '2', '3']),
      cached('5', '1', ['1', '5'], { status: 0 }),
    ]
    const filtered = buildDictScope(rows, null, true, true)
    expect(filtered.rows.map(row => row.id)).toEqual(['1'])
    const unfiltered = buildDictScope(rows, null, true, false)
    expect(unfiltered.rows.map(row => row.id)).toEqual(['1', '2', '3', '5'])
    expect(unfiltered.rows.map(row => row.enabled)).toEqual([true, false, false, false])
    // 停用节点仍保留 hasChildren 语义，管理页不能误判为叶子。
    expect(unfiltered.childrenOf.get('2')?.map(row => row.id)).toEqual(['3'])
  })

  it('一万层深树的组装与展开不依赖调用栈', () => {
    const rows: DictCacheRow[] = []
    const path: string[] = []
    for (let index = 1; index <= 10_000; index++) {
      const id = String(index)
      path.push(id)
      rows.push(cached(id, index === 1 ? null : String(index - 1), [...path]))
    }
    const build = buildDictScope(rows, null, true, false)
    const flat = flattenScopedRows(build)
    expect(flat).toHaveLength(10_000)
    expect(flat[0].id).toBe('1')
    expect(flat[9_999].id).toBe('10000')
    expect(flat[9_999].depth).toBe(10_000)
  })
})
