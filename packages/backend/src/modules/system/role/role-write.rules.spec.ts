import { UnprocessableEntityException } from '@nestjs/common'
import { buildRoleWriteState, normalizePermissionIds } from './role-write.rules.js'
import { RoleStatus } from './role.types.js'

describe('role write rules', () => {
  it('normalizes optional values and preserves immutable current code', () => {
    const current = {
      code: 'finance-manager',
      name: '财务管理员',
      remark: 'old',
      status: RoleStatus.ENABLED,
    } as any

    expect(buildRoleWriteState({ name: '财务角色', remark: '' }, current)).toEqual({
      code: 'finance-manager',
      name: '财务角色',
      remark: null,
      status: RoleStatus.ENABLED,
    })
  })

  it('sorts and deduplicates PostgreSQL bigint permission identities', () => {
    expect(normalizePermissionIds(['9007199254740993', '2', '10', '2'])).toEqual([
      '2',
      '10',
      '9007199254740993',
    ])
  })

  it.each([
    [{ name: '', status: RoleStatus.ENABLED }, 'name'],
    [{ name: '角色', status: 'ENABLED' }, 'status'],
    [{ code: 'UpperCase', name: '角色', status: RoleStatus.ENABLED }, 'code'],
  ])('rejects invalid role state %#', (dto, message) => {
    expect(() => buildRoleWriteState(dto as any, undefined, 'generated-role')).toThrow(message)
    expect(() => buildRoleWriteState(dto as any, undefined, 'generated-role')).toThrow(UnprocessableEntityException)
  })

  it('rejects permission identities outside PostgreSQL bigint', () => {
    expect(() => normalizePermissionIds(['9223372036854775808']))
      .toThrow('PostgreSQL bigint')
  })
})
