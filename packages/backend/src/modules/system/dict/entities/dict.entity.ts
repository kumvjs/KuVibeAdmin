import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { DictStatus } from '../dict.types.js'

@Entity({ name: 'sys_dict' })
@Check('chk_sys_dict_status', '"status" IN (0, 1)')
@Check('chk_sys_dict_order', '"order_no" >= 0')
@Check('chk_sys_dict_parent', '"pid" IS NULL OR "pid" <> "id"')
@Index('uq_sys_dict_code', ['code'], { unique: true, where: '"deleted_at" IS NULL' })
@Index('uq_sys_dict_root_name', ['name'], { unique: true, where: '"pid" IS NULL AND "deleted_at" IS NULL' })
@Index('uq_sys_dict_parent_name', ['pid', 'name'], { unique: true, where: '"pid" IS NOT NULL AND "deleted_at" IS NULL' })
export class SysDictEntity extends CommonEntity {
  @Column({ type: 'bigint', nullable: true })
  @Index('idx_sys_dict_pid')
  pid: string | null

  @ManyToOne(() => SysDictEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pid', foreignKeyConstraintName: 'fk_sys_dict_parent' })
  parent?: Relation<SysDictEntity> | null

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 100 })
  code: string

  @Column({ type: 'varchar', length: 1000, nullable: true })
  value: string | null

  @Column({ type: 'smallint', default: DictStatus.ENABLED })
  status: DictStatus

  @Column({ name: 'order_no', type: 'integer', default: 0 })
  order: number

  @Column({ name: 'cache_enabled', type: 'boolean', default: false })
  cacheEnabled: boolean

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark: string | null
}
