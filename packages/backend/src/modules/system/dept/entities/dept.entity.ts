import type { Relation } from 'typeorm'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm'
import { CommonEntity } from '#/common/entity/common.entity.js'
import { DeptStatus } from '../dept.types.js'

@Entity({ name: 'sys_dept' })
@Check('chk_sys_dept_status', '"status" IN (0, 1)')
@Index('uq_sys_dept_root_name', ['name'], {
  unique: true,
  where: '"pid" IS NULL AND "deleted_at" IS NULL',
})
@Index('uq_sys_dept_parent_name', ['pid', 'name'], {
  unique: true,
  where: '"pid" IS NOT NULL AND "deleted_at" IS NULL',
})
export class SysDeptEntity extends CommonEntity {
  @Column({ type: 'bigint', nullable: true })
  @Index('idx_sys_dept_pid')
  pid?: string | null

  @ManyToOne(() => SysDeptEntity, dept => dept.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'pid' })
  parent?: Relation<SysDeptEntity> | null

  @OneToMany(() => SysDeptEntity, dept => dept.parent)
  children: Relation<SysDeptEntity[]>

  @Column({ length: 20 })
  name: string

  @Column({ type: 'smallint', default: DeptStatus.ENABLED })
  @Index('idx_sys_dept_status')
  status: DeptStatus

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  remark: string | null

  @Column({ name: 'order_no', type: 'integer', default: 0 })
  @Index('idx_sys_dept_order_no')
  order: number
}
