import { getMetadataArgsStorage } from 'typeorm'
import SysRoleMenuEntity from '../../role/entities/role-menu.entity.js'
import { MenuStatus, MenuType } from '../menu.types.js'
import { SysMenuEntity } from './menu.entity.js'

describe('sys menu entity', () => {
  it('persists only stable Vben fields plus JSONB metadata', () => {
    const columns = getMetadataArgsStorage().columns.filter(column => column.target === SysMenuEntity).map(column => column.propertyName)

    expect(columns).toEqual(expect.arrayContaining([
      'authCode',
      'component',
      'meta',
      'name',
      'pid',
      'path',
      'redirect',
      'status',
      'type',
    ]))
    expect(columns).not.toEqual(expect.arrayContaining([
      'activeMenu',
      'extOpenMode',
      'icon',
      'isExt',
      'keepAlive',
      'orderNo',
      'parentId',
      'permission',
      'show',
    ]))
  })

  it('uses the five stable Vben menu types', () => {
    expect(Object.values(MenuType)).toEqual([
      'button',
      'catalog',
      'embedded',
      'link',
      'menu',
    ])
    expect(MenuStatus).toMatchObject({ DISABLED: 0, ENABLED: 1 })
  })

  it('enforces Vben value ranges, uniqueness, and restrictive parent deletion', () => {
    const storage = getMetadataArgsStorage()
    const checkNames = storage.checks
      .filter(check => check.target === SysMenuEntity)
      .map(check => check.name)
    const uniqueIndexes = storage.indices
      .filter(index => index.target === SysMenuEntity && index.unique)
    const uniqueIndexNames = uniqueIndexes.map(index => index.name)
    const parentRelation = storage.relations.find(
      relation => relation.target === SysMenuEntity && relation.propertyName === 'parent',
    )

    expect(checkNames).toEqual(expect.arrayContaining([
      'chk_sys_menu_status',
      'chk_sys_menu_type',
    ]))
    expect(uniqueIndexNames).toEqual(expect.arrayContaining([
      'uq_sys_menu_auth_code',
      'uq_sys_menu_name',
      'uq_sys_menu_path',
    ]))
    expect(uniqueIndexes).toHaveLength(3)
    expect(uniqueIndexes.every(index => index.where === '"deleted_at" IS NULL')).toBe(true)
    expect(parentRelation?.options).toMatchObject({ onDelete: 'RESTRICT' })
  })

  it('uses constrained bigint role-menu relationships', () => {
    const storage = getMetadataArgsStorage()
    const relationColumns = storage.columns
      .filter(column => column.target === SysRoleMenuEntity)
      .filter(column => ['menuId', 'roleId'].includes(column.propertyName))
    const unique = storage.uniques.find(
      item => item.target === SysRoleMenuEntity && item.name === 'uq_sys_role_menu_role_menu',
    )
    const menuRelation = storage.relations.find(
      relation => relation.target === SysRoleMenuEntity && relation.propertyName === 'menu',
    )

    expect(relationColumns).toHaveLength(2)
    expect(relationColumns.every(column => column.options.type === 'bigint')).toBe(true)
    expect(unique?.columns).toEqual(['roleId', 'menuId'])
    expect(menuRelation?.options).toMatchObject({ onDelete: 'RESTRICT' })
  })
})
