import { ApiProperty } from '@nestjs/swagger'
import { BaseEntity, Column, CreateDateColumn, DeleteDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export abstract class CommonEntity extends BaseEntity {
  @PrimaryGeneratedColumn({
    type: 'bigint',
  })
  @ApiProperty({ description: 'id' })
  id!: string

  @Column({
    name: 'tenant_id',
    type: 'bigint',
    default: 1,
  })
  @ApiProperty({ type: String, description: '租户 ID（预留）', default: '1' })
  tenantId: string = '1'

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    update: false,
  })
  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  @ApiProperty({ type: Date, description: '删除时间', required: false })
  deletedAt?: Date | null

  @Column({
    type: 'bigint',
    name: 'created_by',
    nullable: true,
    update: false,
  })
  @ApiProperty({ type: String, description: '创建人', required: false })
  createdBy?: string | null

  @Column({
    type: 'bigint',
    name: 'updated_by',
    nullable: true,
  })
  @ApiProperty({ type: String, description: '更新人', required: false })
  updatedBy?: string | null
}
