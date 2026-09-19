import type { Relation } from 'typeorm'
import { ApiHideProperty } from '@nestjs/swagger'
import { Check, Column, Entity, Index, OneToMany } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { RoleStatus } from '../role.types.js'
import SysRoleMenuEntity from './role-menu.entity.js'

@Entity({ name: 'sys_role' })
@Check('chk_sys_role_status', '"status" IN (0, 1)')
export class SysRoleEntity extends CommonEntity {
  @Column({ length: 50 })
  @Index('uq_sys_role_name', { unique: true, where: '"deleted_at" IS NULL' })
  name: string

  @Column({ length: 64 })
  @Index('uq_sys_role_code', { unique: true })
  code: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null

  @Column({ type: 'smallint', default: RoleStatus.ENABLED })
  @Index('idx_sys_role_status')
  status: RoleStatus

  @Column({ name: 'is_default', default: false })
  @Index('idx_sys_role_is_default')
  isDefault: boolean

  @ApiHideProperty()
  @OneToMany(() => SysUserRoleEntity, ur => ur.role, {
    onDelete: 'CASCADE',
  })
  userRoles: Relation<SysUserRoleEntity[]>

  @ApiHideProperty()
  @OneToMany(() => SysRoleMenuEntity, rm => rm.role, { onDelete: 'CASCADE' })
  roleMenus: Relation<SysRoleMenuEntity[]>
}
