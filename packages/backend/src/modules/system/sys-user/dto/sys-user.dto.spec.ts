import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UserStatus } from '../sys-user.types.js'
import { CreateSysUserDto } from './create-sys-user.dto.js'
import { SysUserIdParamDto } from './sys-user-id-param.dto.js'
import { QuerySysUserListDto } from './sys-user.dto.js'
import { UpdateSysUserDto } from './update-sys-user.dto.js'

describe('vben system-user DTO', () => {
  it('accepts explicit login credentials, department, and role-based authorization', async () => {
    const dto = Object.assign(new CreateSysUserDto(), {
      deptId: '9007199254740993',
      name: '财务用户',
      password: 'correct horse battery staple',
      roleIds: ['2', '9007199254740993'],
      status: UserStatus.ENABLED,
      username: 'finance.user',
    })

    await expect(validate(dto)).resolves.toEqual([])
    await expect(validate(Object.assign(new SysUserIdParamDto(), {
      id: '9007199254740993',
    }))).resolves.toEqual([])
  })

  it('supports Vben status-only updates without allowing username changes', async () => {
    const dto = Object.assign(new UpdateSysUserDto(), { status: UserStatus.DISABLED })

    await expect(validate(dto)).resolves.toEqual([])
    expect(Reflect.getMetadata('swagger/apiModelPropertiesArray', UpdateSysUserDto.prototype))
      .not
      .toContain(':username')
  })

  it('transforms every Vben list filter and rejects invalid bounds', async () => {
    const query = plainToInstance(QuerySysUserListDto, {
      deptId: '12',
      endTime: '2026-09-08T23:59:59.000Z',
      id: '42',
      name: '用户',
      page: '2',
      pageSize: '50',
      remark: 'finance',
      startTime: '2026-09-01T00:00:00.000Z',
      status: '0',
    })

    await expect(validate(query)).resolves.toEqual([])
    expect(query).toMatchObject({ page: 2, pageSize: 50, status: UserStatus.DISABLED })

    const invalid = plainToInstance(QuerySysUserListDto, {
      deptId: '0',
      endTime: 'not-a-date',
      page: '0',
      pageSize: '101',
      status: '2',
    })
    expect((await validate(invalid)).map(error => error.property)).toEqual(expect.arrayContaining([
      'deptId',
      'endTime',
      'page',
      'pageSize',
      'status',
    ]))
  })

  it('rejects weak credentials, direct menu permissions, and duplicate role IDs', async () => {
    const dto = Object.assign(new CreateSysUserDto(), {
      deptId: '1',
      name: ' user ',
      password: 'short',
      permissions: ['1'],
      roleIds: ['2', '2'],
      status: true,
      username: 'bad user',
    })
    const properties = (await validate(dto)).map(error => error.property)

    expect(properties).toEqual(expect.arrayContaining([
      'name',
      'password',
      'roleIds',
      'status',
      'username',
    ]))
    expect(Reflect.getMetadata('swagger/apiModelPropertiesArray', CreateSysUserDto.prototype))
      .not
      .toContain(':permissions')
  })
})
