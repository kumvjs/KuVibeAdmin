import type { Relation } from 'typeorm'
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm'

import { CommonEntity } from '#/common/entity/common.entity.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'

@Entity('user_refresh_token')
export class RefreshTokenEntity extends CommonEntity {
  @Column({ length: 500 })
  @Index('uq_user_refresh_token_value', { unique: true })
  value!: string

  @Column({ type: 'timestamptz', comment: '令牌过期时间' })
  expired_at!: Date

  @Column({ name: 'user_id', type: 'bigint' })
  @Index('idx_user_refresh_token_user_id')
  userId!: string

  @ManyToOne(() => SysUserEntity, user => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<SysUserEntity>
}
