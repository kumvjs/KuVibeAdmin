import type { Relation } from 'typeorm'
import { ApiHideProperty } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { RefreshTokenEntity } from '#/modules/auth/entities/refresh-token.entity.js'
import { SysDeptEntity } from '#/modules/system/dept/entities/dept.entity.js'
import { PasswordAlgorithm, UserStatus } from '#/modules/system/sys-user/sys-user.types.js'
import { hashPassword, passwordHashNeedsRehash, verifyPasswordHash } from '../password-hasher.js'
import SysUserRoleEntity from './user-role.entity.js'

@Entity({ name: 'sys_user' })
@Check('chk_sys_user_status', '"status" IN (0, 1)')
@Check('chk_sys_user_password_algorithm', '"password_algorithm" = \'argon2id\'')
@Check('chk_sys_user_password_hash', '"password_hash" LIKE \'$argon2id$%\'')
@Check('chk_sys_user_session_version', '"session_version" > 0')
export class SysUserEntity extends CommonEntity {
  @Column({ length: 100 })
  @Index('uq_sys_user_username', { unique: true, where: '"deleted_at" IS NULL' })
  username: string

  @Column({ length: 100 })
  @Index('idx_sys_user_name')
  name: string

  @Exclude()
  @Column({ length: 255, name: 'password_hash', select: false })
  passwordHash: string

  @Exclude()
  @Column({
    default: PasswordAlgorithm.ARGON2ID,
    length: 16,
    name: 'password_algorithm',
    select: false,
  })
  passwordAlgorithm: PasswordAlgorithm

  @Column({ default: 1, name: 'session_version', type: 'integer' })
  sessionVersion: number

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar: string | null

  @Column({ type: 'varchar', length: 255, name: 'home_path', nullable: true })
  homePath: string | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  @Index('idx_sys_user_dept_id')
  deptId: string | null

  @ApiHideProperty()
  @ManyToOne(() => SysDeptEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'dept_id' })
  dept: Relation<SysDeptEntity> | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null

  @Column({ default: UserStatus.ENABLED, type: 'smallint' })
  @Index('idx_sys_user_status')
  status: UserStatus

  @ApiHideProperty()
  @OneToMany(() => SysUserRoleEntity, userRole => userRole.user)
  userRoles: Relation<SysUserRoleEntity[]>

  @ApiHideProperty()
  @OneToMany(() => RefreshTokenEntity, refreshToken => refreshToken.user)
  refreshTokens: Relation<RefreshTokenEntity[]>

  async setPassword(password: string): Promise<void> {
    this.passwordHash = await hashPassword(password)
    this.passwordAlgorithm = PasswordAlgorithm.ARGON2ID
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (this.passwordAlgorithm !== PasswordAlgorithm.ARGON2ID)
      return false
    return verifyPasswordHash(this.passwordHash, password)
  }

  passwordNeedsRehash(): boolean {
    return this.passwordAlgorithm !== PasswordAlgorithm.ARGON2ID
      || passwordHashNeedsRehash(this.passwordHash)
  }
}
