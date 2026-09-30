import { Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm'

/** 财务记录不继承带软删除的 CommonEntity，操作者由业务显式记录。 */
export abstract class BillingRecord {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column({ name: 'tenant_id', type: 'bigint', default: '1' })
  tenantId: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
