import { validate } from 'class-validator'
import { DeptStatus } from '../dept.types.js'
import { CreateDeptDto } from './create-dept.dto.js'
import { DeptIdParamDto } from './dept-id-param.dto.js'
import { UpdateDeptDto } from './update-dept.dto.js'

describe('vben department DTO', () => {
  it('accepts the Vben fields plus explicit sibling order', async () => {
    const dto = Object.assign(new CreateDeptDto(), {
      name: 'Research Center',
      order: 20,
      pid: '9007199254740993',
      remark: 'Core platform team',
      status: DeptStatus.ENABLED,
    })
    const params = Object.assign(new DeptIdParamDto(), { id: '9007199254740993' })

    await expect(validate(dto)).resolves.toEqual([])
    await expect(validate(params)).resolves.toEqual([])
  })

  it('keeps update fields optional while retaining their validators', async () => {
    const partial = Object.assign(new UpdateDeptDto(), { status: DeptStatus.DISABLED })
    const invalid = Object.assign(new UpdateDeptDto(), { order: -1 })

    await expect(validate(partial)).resolves.toEqual([])
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: 'order' }),
    ])
  })

  it('rejects boolean status, edge whitespace, oversized remarks, and invalid IDs', async () => {
    const dto = Object.assign(new CreateDeptDto(), {
      name: ' Research ',
      pid: '-1',
      remark: 'x'.repeat(51),
      status: true,
    })
    const params = Object.assign(new DeptIdParamDto(), { id: '0' })

    const [dtoErrors, paramErrors] = await Promise.all([validate(dto), validate(params)])
    expect(dtoErrors.map(error => error.property)).toEqual(expect.arrayContaining([
      'name',
      'pid',
      'remark',
      'status',
    ]))
    expect(paramErrors).toEqual([expect.objectContaining({ property: 'id' })])
  })
})
