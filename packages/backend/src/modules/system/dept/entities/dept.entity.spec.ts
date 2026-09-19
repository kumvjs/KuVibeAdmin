import { getMetadataArgsStorage } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { DeptStatus } from '../dept.types.js'
import { SysDeptEntity } from './dept.entity.js'

describe('sys department entity', () => {
  it('persists the Vben fields, ordering, and audit-compatible hierarchy', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      column => column.target === SysDeptEntity,
    ).map(column => column.propertyName)

    expect(columns).toEqual(expect.arrayContaining([
      'name',
      'order',
      'pid',
      'remark',
      'status',
    ]))
    expect(DeptStatus).toMatchObject({ DISABLED: 0, ENABLED: 1 })
  })

  it('enforces active sibling uniqueness and restrictive parent deletion', () => {
    const storage = getMetadataArgsStorage()
    const indexes = storage.indices.filter(index => index.target === SysDeptEntity)
    const parent = storage.relations.find(
      relation => relation.target === SysDeptEntity && relation.propertyName === 'parent',
    )

    expect(indexes.find(index => index.name === 'uq_sys_dept_root_name')).toMatchObject({
      unique: true,
      where: '"pid" IS NULL AND "deleted_at" IS NULL',
    })
    expect(indexes.find(index => index.name === 'uq_sys_dept_parent_name')).toMatchObject({
      unique: true,
      where: '"pid" IS NOT NULL AND "deleted_at" IS NULL',
    })
    expect(parent?.options).toMatchObject({ onDelete: 'RESTRICT' })
  })

  it('maps an indexed nullable user department with restrictive deletion', () => {
    const storage = getMetadataArgsStorage()
    const deptId = storage.columns.find(
      column => column.target === SysUserEntity && column.propertyName === 'deptId',
    )
    const index = storage.indices.find(
      item => item.target === SysUserEntity && item.name === 'idx_sys_user_dept_id',
    )
    const relation = storage.relations.find(
      item => item.target === SysUserEntity && item.propertyName === 'dept',
    )

    expect(deptId?.options).toMatchObject({ name: 'dept_id', nullable: true, type: 'bigint' })
    expect(index).toBeDefined()
    expect(relation?.options).toMatchObject({ nullable: true, onDelete: 'RESTRICT' })
  })
})
