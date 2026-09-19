import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RoleStatus } from '../role.types.js'
import { CreateRoleDto } from './create-role.dto.js'
import { RoleIdParamDto } from './role-id-param.dto.js'
import { RoleListQueryDto } from './role-list-query.dto.js'
import { UpdateRoleDto } from './update-role.dto.js'

describe('vben role DTO', () => {
  it('accepts role fields, immutable custom code, and bigint permission IDs', async () => {
    const dto = Object.assign(new CreateRoleDto(), {
      code: 'finance-manager',
      name: '财务管理员',
      permissions: ['1', '9007199254740993'],
      remark: 'Finance operations',
      status: RoleStatus.ENABLED,
    })
    const params = Object.assign(new RoleIdParamDto(), { id: '9007199254740993' })

    await expect(validate(dto)).resolves.toEqual([])
    await expect(validate(params)).resolves.toEqual([])
  })

  it('keeps partial update fields optional and validates numeric status', async () => {
    const partial = Object.assign(new UpdateRoleDto(), { status: RoleStatus.DISABLED })
    const invalid = Object.assign(new UpdateRoleDto(), { status: 'ENABLED' })

    await expect(validate(partial)).resolves.toEqual([])
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: 'status' }),
    ])
  })

  it('transforms and validates every Vben role-list filter', async () => {
    const query = plainToInstance(RoleListQueryDto, {
      endTime: '2026-09-08T23:59:59.000Z',
      id: '9007199254740993',
      name: '财务',
      page: '2',
      pageSize: '50',
      remark: 'operations',
      startTime: '2026-09-01T00:00:00.000Z',
      status: '0',
    })

    await expect(validate(query)).resolves.toEqual([])
    expect(query).toMatchObject({ page: 2, pageSize: 50, status: RoleStatus.DISABLED })
  })

  it('rejects duplicate or invalid permissions, unsafe codes, and bad paging', async () => {
    const dto = Object.assign(new CreateRoleDto(), {
      code: 'SUPER ROLE',
      name: ' role ',
      permissions: ['0', '0'],
      status: true,
    })
    const query = plainToInstance(RoleListQueryDto, {
      endTime: 'not-a-date',
      page: '0',
      pageSize: '101',
      status: '2',
    })

    const [dtoErrors, queryErrors] = await Promise.all([validate(dto), validate(query)])
    expect(dtoErrors.map(error => error.property)).toEqual(expect.arrayContaining([
      'code',
      'name',
      'permissions',
      'status',
    ]))
    expect(queryErrors.map(error => error.property)).toEqual(expect.arrayContaining([
      'endTime',
      'page',
      'pageSize',
      'status',
    ]))
  })
})
