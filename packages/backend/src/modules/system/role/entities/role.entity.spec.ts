import { getMetadataArgsStorage } from 'typeorm'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { RoleStatus } from '../role.types.js'
import SysRoleMenuEntity from './role-menu.entity.js'
import { SysRoleEntity } from './role.entity.js'

describe('sys role entities', () => {
  it('models immutable identity, display fields, numeric status, and default protection', () => {
    const storage = getMetadataArgsStorage()
    const columns = storage.columns.filter(column => column.target === SysRoleEntity)
    const status = columns.find(column => column.propertyName === 'status')
    const isDefault = columns.find(column => column.propertyName === 'isDefault')

    expect(columns.map(column => column.propertyName)).toEqual(expect.arrayContaining([
      'code',
      'isDefault',
      'name',
      'remark',
      'status',
    ]))
    expect(status?.options).toMatchObject({ default: RoleStatus.ENABLED, type: 'smallint' })
    expect(isDefault?.options).toMatchObject({ default: false, name: 'is_default' })
  })

  it('uses active display-name uniqueness and global code uniqueness', () => {
    const indexes = getMetadataArgsStorage().indices.filter(index => index.target === SysRoleEntity)

    expect(indexes.find(index => index.name === 'uq_sys_role_name')).toMatchObject({
      unique: true,
      where: '"deleted_at" IS NULL',
    })
    expect(indexes.find(index => index.name === 'uq_sys_role_code')).toMatchObject({ unique: true })
  })

  it('retains unique constrained bigint role-menu mappings', () => {
    const storage = getMetadataArgsStorage()
    const columns = storage.columns.filter(column => column.target === SysRoleMenuEntity)
    const unique = storage.uniques.find(
      item => item.target === SysRoleMenuEntity && item.name === 'uq_sys_role_menu_role_menu',
    )
    const role = storage.relations.find(
      item => item.target === SysRoleMenuEntity && item.propertyName === 'role',
    )
    const menu = storage.relations.find(
      item => item.target === SysRoleMenuEntity && item.propertyName === 'menu',
    )

    expect(columns.filter(column => ['menuId', 'roleId'].includes(column.propertyName)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ options: expect.objectContaining({ type: 'bigint' }) }),
        expect.objectContaining({ options: expect.objectContaining({ type: 'bigint' }) }),
      ]))
    expect(unique?.columns).toEqual(['roleId', 'menuId'])
    expect(role?.options).toMatchObject({ onDelete: 'CASCADE' })
    expect(menu?.options).toMatchObject({ onDelete: 'RESTRICT' })
  })

  it('makes the user-role foreign key a final restrictive deletion safeguard', () => {
    const storage = getMetadataArgsStorage()
    const relation = storage.relations.find(
      item => item.target === SysUserRoleEntity && item.propertyName === 'role',
    )
    const unique = storage.uniques.find(
      item => item.target === SysUserRoleEntity && item.name === 'uq_sys_user_role_user_role',
    )
    const indexes = storage.indices
      .filter(item => item.target === SysUserRoleEntity)
      .map(item => item.name)

    expect(relation?.options).toMatchObject({ onDelete: 'RESTRICT' })
    expect(unique?.columns).toEqual(['userId', 'roleId'])
    expect(indexes).toEqual(expect.arrayContaining([
      'idx_sys_user_role_role_id',
      'idx_sys_user_role_user_id',
    ]))
  })
})
