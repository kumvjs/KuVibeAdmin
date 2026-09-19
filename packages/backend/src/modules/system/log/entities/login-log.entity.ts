import type { Relation } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'

@Entity({ name: 'sys_login_log' })
export class LoginLogEntity extends CommonEntity {
  @Column({ nullable: true })
  @ApiProperty({ description: 'IP' })
  ip: string

  @Column({ nullable: true })
  @ApiProperty({ description: '地址' })
  address: string

  @Column({ nullable: true })
  @ApiProperty({ description: '登录方式' })
  provider: string

  @Column({ length: 500, nullable: true })
  @ApiProperty({ description: '浏览器ua' })
  ua: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<SysUserEntity>
}
