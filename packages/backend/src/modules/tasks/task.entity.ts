import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('sys_scheduled_task')
@Index('uq_scheduled_task_name', ['name'], { unique: true })
@Check('chk_scheduled_task_id', 'id < 2147483647')
export class ScheduledTaskEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string
  @Column({ type: 'varchar', length: 100 }) name: string
  @Column({ name: 'handler_key', type: 'varchar', length: 100 }) handlerKey: string
  @Column({ name: 'cron_expression', type: 'varchar', length: 100 }) cronExpression: string
  @Column({ name: 'time_zone', type: 'varchar', length: 100 }) timeZone: string
  @Column({ type: 'boolean', default: true }) enabled: boolean
  @Column({ type: 'varchar', length: 500, nullable: true }) description: string | null
  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true }) nextRunAt: Date | null
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date
}

@Entity('sys_task_execution')
@Index('idx_task_execution_page', ['taskId', 'id'])
@Index('idx_task_execution_retention', ['startedAt'])
@Index('idx_task_execution_running', ['taskId', 'startedAt'], { where: 'status=\'running\'' })
@Index('uq_task_execution_dispatch', ['dispatchKey'], { unique: true })
@Check('chk_task_execution_status', 'status IN (\'running\',\'success\',\'failed\',\'skipped\')')
export class TaskExecutionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string
  // 不关联外键，删除任务仍保留执行审计。
  @Column({ name: 'task_id', type: 'bigint' }) taskId: string
  @Column({ name: 'task_name', type: 'varchar', length: 100 }) taskName: string
  @Column({ name: 'handler_key', type: 'varchar', length: 100 }) handlerKey: string
  @Column({ type: 'varchar', length: 10 }) trigger: 'cron' | 'manual'
  @Column({ type: 'varchar', length: 10 }) status: 'running' | 'success' | 'failed' | 'skipped'
  @Column({ name: 'dispatch_key', type: 'varchar', length: 100 }) dispatchKey: string
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt: Date
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt: Date | null
  @Column({ name: 'duration_ms', type: 'integer', nullable: true }) durationMs: number | null
  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true }) errorCode: string | null
}
