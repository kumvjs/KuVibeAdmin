import type { Relation } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { SysRoleEntity } from '#/modules/system/role/entities/role.entity.js'
import { SysUserEntity } from './user.entity.js'

@Entity({ name: 'sys_user_role' })
@Unique('uq_sys_user_role_user_role', ['userId', 'roleId'])
export default class SysUserRoleEntity extends CommonEntity {
  @Column({ type: 'bigint', name: 'user_id' })
  @Index('idx_sys_user_role_user_id')
  @ApiProperty()
  userId: string

  @ManyToOne(() => SysUserEntity, user => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<SysUserEntity>

  @Column({ type: 'bigint', name: 'role_id' })
  @Index('idx_sys_user_role_role_id')
  @ApiProperty()
  roleId: string

  @ManyToOne(() => SysRoleEntity, role => role.userRoles, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role: Relation<SysRoleEntity>
}
