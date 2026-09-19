import type { Relation } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { SysMenuEntity } from '../../menu/entities/menu.entity.js'
import { SysRoleEntity } from './role.entity.js'

@Entity({ name: 'sys_role_menu' })
@Unique('uq_sys_role_menu_role_menu', ['roleId', 'menuId'])
export default class SysRoleMenuEntity extends CommonEntity {
  @Column({ type: 'bigint', name: 'role_id' })
  @Index('idx_sys_role_menu_role_id')
  @ApiProperty()
  roleId: string

  @ManyToOne(() => SysRoleEntity, role => role.roleMenus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Relation<SysRoleEntity>

  @Column({ type: 'bigint', name: 'menu_id' })
  @Index('idx_sys_role_menu_menu_id')
  @ApiProperty()
  menuId: string

  @ManyToOne(() => SysMenuEntity, menu => menu.roleMenus, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'menu_id' })
  menu: Relation<SysMenuEntity>
}
