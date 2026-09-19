import { UnprocessableEntityException } from '@nestjs/common'
import { buildDeptWriteState } from './dept-write.rules.js'
import { DeptStatus } from './dept.types.js'

describe('department write rules', () => {
  it('normalizes a root payload and defaults order and remark', () => {
    expect(buildDeptWriteState({
      name: '研发中心',
      pid: '0',
      status: DeptStatus.ENABLED,
    })).toEqual({
      name: '研发中心',
      order: 0,
      pid: null,
      remark: null,
      status: DeptStatus.ENABLED,
    })
  })

  it('merges a partial update without losing persisted fields', () => {
    const current = {
      name: '研发中心',
      order: 10,
      pid: '1',
      remark: 'old',
      status: DeptStatus.ENABLED,
    } as any

    expect(buildDeptWriteState({ remark: '' }, current)).toEqual({
      name: '研发中心',
      order: 10,
      pid: '1',
      remark: null,
      status: DeptStatus.ENABLED,
    })
  })

  it.each([
    [{ name: 'A', status: DeptStatus.ENABLED }, 'name'],
    [{ name: ' 研发中心', status: DeptStatus.ENABLED }, 'name'],
    [{ name: '研发中心', order: 1.5, status: DeptStatus.ENABLED }, 'order'],
    [{ name: '研发中心', status: 'ENABLED' }, 'status'],
    [{ name: '研发中心', pid: '9223372036854775808', status: DeptStatus.ENABLED }, 'PostgreSQL bigint'],
  ])('rejects invalid business state %#', (dto, message) => {
    expect(() => buildDeptWriteState(dto as any)).toThrow(message)
    expect(() => buildDeptWriteState(dto as any)).toThrow(UnprocessableEntityException)
  })
})
