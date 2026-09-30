import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import type { TaskLogQueryDto, TaskQueryDto, TaskWriteDto } from './task.dto.js'
import { randomUUID } from 'node:crypto'
import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, SchedulerRegistry } from '@nestjs/schedule'
import { CronJob, CronTime } from 'cron'
import { DataSource } from 'typeorm'
import { BillingWorker } from '../billing/orders/billing.worker.js'
import { AttachmentService } from '../upload/attachment.service.js'
import { ScheduledTaskEntity, TaskExecutionEntity } from './task.entity.js'

export const TASK_HANDLERS = [
  { key: 'billing.outbox', name: '账务任务投递', description: '把到期 outbox 任务可靠投递到 RabbitMQ，保留领域重试和幂等' },
  { key: 'attachments.cleanup', name: '附件清理', description: '分批清理过期及待删除附件，每次最多 100 条' },
]

@Injectable()
export class TasksService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name)
  private readonly definitions = new Map<string, string>()
  private syncing = false
  private stopped = false
  private active = new Set<Promise<unknown>>()
  private readonly pendingCron = new Map<string, { handlerKey: string, resolve: (value: unknown) => void, reject: (reason: unknown) => void }>()
  private readonly activeCronHandlers = new Set<string>()

  constructor(private readonly source: DataSource, private readonly registry: SchedulerRegistry, private readonly billing: BillingWorker, private readonly attachments: AttachmentService, private readonly config: ConfigService) {}

  async onApplicationBootstrap() { await this.synchronize() }

  @Cron('*/10 * * * * *', { name: 'task-config-sync', waitForCompletion: true })
  async synchronize() {
    if (this.syncing || this.stopped)
      return
    this.syncing = true
    try {
      const tasks = await this.source.getRepository(ScheduledTaskEntity).find({ order: { id: 'ASC' }, take: 100 })
      const present = new Set(tasks.filter(task => task.enabled).map(task => task.id))
      for (const id of this.definitions.keys()) {
        if (!present.has(id)) {
          this.registry.deleteCronJob(`task:${id}`)
          this.definitions.delete(id)
        }
      }
      for (const task of tasks.filter(task => task.enabled)) {
        const signature = JSON.stringify([task.cronExpression, task.timeZone, task.handlerKey])
        if (this.definitions.get(task.id) === signature)
          continue
        if (this.definitions.has(task.id)) {
          this.registry.deleteCronJob(`task:${task.id}`)
          this.definitions.delete(task.id)
        }
        try {
          this.validate(task)
          const job = CronJob.from({ cronTime: task.cronExpression, timeZone: task.timeZone, waitForCompletion: true, onTick: async () => {
            if (this.stopped)
              return
            await this.enqueueCron(task.id, task.handlerKey).catch(() => this.logger.warn('定时任务未完成，请查看执行日志'))
          } })
          this.registry.addCronJob(`task:${task.id}`, job)
          this.definitions.set(task.id, signature)
          job.start()
        }
        catch { this.logger.warn(`任务 ${task.id} 配置无效，未注册`) }
      }
    }
    catch { this.logger.warn('任务配置同步失败，下周期重试') }
    finally { this.syncing = false }
  }

  validate(dto: Pick<TaskWriteDto, 'handlerKey' | 'cronExpression' | 'timeZone'>) {
    if (!TASK_HANDLERS.some(handler => handler.key === dto.handlerKey))
      throw new UnprocessableEntityException('任务处理器未注册')
    if (dto.cronExpression.trim().split(/\s+/).length !== 6)
      throw new UnprocessableEntityException('Cron 必须为六段表达式，最小间隔为一秒')
    try {
      new Intl.DateTimeFormat('zh-CN', { timeZone: dto.timeZone }).resolvedOptions()
      new CronTime(dto.cronExpression, dto.timeZone).sendAt()
    }
    catch { throw new UnprocessableEntityException('Cron 表达式或 IANA 时区无效') }
  }

  private response(row: ScheduledTaskEntity) {
    const { nextRunAt: _next, ...fields } = row
    return { ...fields, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
  }

  private logResponse(row: TaskExecutionEntity) {
    const { dispatchKey: _key, ...fields } = row
    return { ...fields, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null }
  }

  async list(query: TaskQueryDto) {
    const builder = this.source.getRepository(ScheduledTaskEntity).createQueryBuilder('task')
    if (query.keyword)
      builder.andWhere('task.name ILIKE :keyword', { keyword: `%${query.keyword.replace(/[\\%_]/g, '\\$&')}%` })
    if (query.enabled !== undefined)
      builder.andWhere('task.enabled=:enabled', { enabled: query.enabled })
    const [items, total] = await builder.orderBy('task.id', 'DESC').skip((query.page - 1) * query.pageSize).take(query.pageSize).getManyAndCount()
    return { items: items.map(row => this.response(row)), total, page: query.page, pageSize: query.pageSize }
  }

  async create(dto: TaskWriteDto) {
    this.validate(dto)
    dto.name = dto.name.trim()
    if (!dto.name)
      throw new UnprocessableEntityException('任务名称不能为空')
    const row = await this.source.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(42422,0)')
      if (await manager.getRepository(ScheduledTaskEntity).existsBy({ name: dto.name }))
        throw new ConflictException('任务名称已存在，请刷新列表确认创建结果')
      if (await manager.getRepository(ScheduledTaskEntity).count() >= 100)
        throw new ConflictException('最多配置 100 个任务')
      return manager.getRepository(ScheduledTaskEntity).save({ ...dto, description: dto.description ?? null, nextRunAt: new CronTime(dto.cronExpression, dto.timeZone).sendAt().toJSDate() })
    })
    await this.synchronize()
    return this.response(row)
  }

  async update(id: string, dto: TaskWriteDto) {
    this.validate(dto)
    dto.name = dto.name.trim()
    if (!dto.name)
      throw new UnprocessableEntityException('任务名称不能为空')
    try {
      await this.mutate(id, async manager => manager.getRepository(ScheduledTaskEntity).update(id, { ...dto, description: dto.description ?? null, nextRunAt: new CronTime(dto.cronExpression, dto.timeZone).sendAt().toJSDate() }))
    }
    catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('任务名称已存在')
      throw error
    }
    await this.synchronize()
    return this.response(await this.get(id))
  }

  async status(id: string, enabled: boolean) {
    await this.mutate(id, async (manager, row) => manager.getRepository(ScheduledTaskEntity).update(id, { enabled, nextRunAt: new CronTime(row.cronExpression, row.timeZone).sendAt().toJSDate() }))
    await this.synchronize()
    return this.response(await this.get(id))
  }

  async remove(id: string) {
    await this.mutate(id, async manager => manager.getRepository(ScheduledTaskEntity).delete(id))
    await this.synchronize()
    return true
  }

  private async mutate(id: string, write: (manager: import('typeorm').EntityManager, row: ScheduledTaskEntity) => Promise<unknown>) {
    await this.source.transaction(async (manager) => {
      const [lock] = await manager.query('SELECT pg_try_advisory_xact_lock(42423,$1::int) AS locked', [id])
      if (!lock.locked)
        throw new ConflictException('任务正在执行，请稍后修改配置')
      const row = await manager.getRepository(ScheduledTaskEntity).findOneBy({ id })
      if (!row)
        throw new NotFoundException('任务不存在')
      await write(manager, row)
    })
  }

  private async get(id: string) {
    const row = await this.source.getRepository(ScheduledTaskEntity).findOneBy({ id })
    if (!row)
      throw new NotFoundException('任务不存在')
    return row
  }

  async logs(id: string | undefined, query: TaskLogQueryDto) {
    const builder = this.source.getRepository(TaskExecutionEntity).createQueryBuilder('log')
    if (id)
      builder.where('log.taskId=:id', { id })
    if (query.status)
      builder.andWhere('log.status=:status', { status: query.status })
    const [items, total] = await builder.orderBy('log.id', 'DESC').skip((query.page - 1) * query.pageSize).take(query.pageSize).getManyAndCount()
    return { items: items.map(row => this.logResponse(row)), total, page: query.page, pageSize: query.pageSize }
  }

  run(id: string, trigger: 'cron' | 'manual' = 'manual', key = `manual:${randomUUID()}`) {
    if (this.stopped)
      return Promise.reject(new ConflictException('任务调度正在关闭'))
    if (this.active.size >= Number(this.config.get('TASK_EXECUTION_CONCURRENCY', 2)))
      return Promise.reject(new ConflictException('本实例执行容量已满，请稍后重试'))
    const work = this.execute(id, trigger, key)
    this.active.add(work)
    const finish = () => {
      this.active.delete(work)
      this.drainCronQueue()
    }
    void work.then(finish, finish)
    return work
  }

  /** 同处理器按入队顺序执行；队列只保存最多 100 个 taskId，错过周期合并为一次。 */
  private enqueueCron(id: string, handlerKey: string): Promise<unknown> {
    if (this.stopped || this.pendingCron.has(id))
      return Promise.resolve(null)
    if (this.pendingCron.size >= 100)
      return Promise.reject(new ConflictException('定时任务等待队列已满'))
    return new Promise((resolve, reject) => {
      this.pendingCron.set(id, { handlerKey, resolve, reject })
      this.drainCronQueue()
    })
  }

  private drainCronQueue() {
    while (!this.stopped && this.active.size < Number(this.config.get('TASK_EXECUTION_CONCURRENCY', 2))) {
      // 每处理器 FIFO；不同处理器可并行，扫描严格限制在 100 条配置内。
      const candidate = [...this.pendingCron.entries()].find(([, entry]) => !this.activeCronHandlers.has(entry.handlerKey))
      if (!candidate)
        break
      const [id, entry] = candidate
      this.pendingCron.delete(id)
      this.activeCronHandlers.add(entry.handlerKey)
      const finish = () => {
        this.activeCronHandlers.delete(entry.handlerKey)
        this.drainCronQueue()
      }
      void this.run(id, 'cron').then((value) => {
        finish()
        entry.resolve(value)
      }, (reason) => {
        finish()
        entry.reject(reason)
      })
    }
  }

  private async execute(id: string, trigger: 'cron' | 'manual', dispatchKey: string) {
    const runner = this.source.createQueryRunner()
    let locked = false
    let handlerLocked = false
    let handlerKey = ''
    try {
      await runner.connect()
      const [lock] = await runner.query('SELECT pg_try_advisory_lock(42423,$1::int) AS locked', [id])
      locked = lock.locked
      if (!locked)
        throw new ConflictException('任务正在执行')
      const task = await this.get(id)
      if (trigger === 'cron' && !task.enabled)
        return null
      const [{ now }] = await runner.query('SELECT clock_timestamp() AS now')
      if (trigger === 'cron' && task.nextRunAt && task.nextRunAt > now)
        return null
      handlerKey = task.handlerKey
      const [handlerLock] = await runner.query('SELECT pg_try_advisory_lock(42424,hashtext($1)) AS locked', [handlerKey])
      handlerLocked = handlerLock.locked
      const logs = this.source.getRepository(TaskExecutionEntity)
      // 获得连接级锁意味着旧进程不再执行，恢复遗留 running 审计。
      await logs.createQueryBuilder().update().set({ status: 'failed', finishedAt: new Date(), errorCode: 'execution_interrupted' }).where('task_id=:id AND status=\'running\'', { id }).execute()
      const startedAt = new Date()
      await runner.startTransaction()
      if (trigger === 'cron') {
        dispatchKey = `cron:${id}:${task.nextRunAt?.getTime() ?? now.getTime()}`
        const nextRunAt = new CronTime(task.cronExpression, task.timeZone).getNextDateFrom(now, task.timeZone).toJSDate()
        // 运行游标不改变配置更新时间，后台可辨认管理员最后一次修改。
        await runner.query('UPDATE sys_scheduled_task SET next_run_at=$1 WHERE id=$2', [nextRunAt, id])
      }
      const insert = await runner.manager.getRepository(TaskExecutionEntity).createQueryBuilder().insert().values({ taskId: id, taskName: task.name, handlerKey, trigger, dispatchKey, status: handlerLocked ? 'running' : 'skipped', startedAt, finishedAt: handlerLocked ? null : startedAt, durationMs: handlerLocked ? null : 0, errorCode: handlerLocked ? null : 'handler_busy' }).orIgnore().returning('id').execute()
      await runner.commitTransaction()
      if (!insert.raw.length)
        return null
      const logId = String(insert.raw[0].id)
      if (handlerLocked) {
        try {
          this.validate(task)
          if (handlerKey === 'billing.outbox')
            await this.billing.dispatch()
          else await this.attachments.cleanup()
          await logs.update(logId, { status: 'success', finishedAt: new Date(), durationMs: Math.min(2147483647, Date.now() - startedAt.getTime()) })
        }
        catch (error) {
          const message = error instanceof Error ? error.message : ''
          const errorCode = ['rabbitmq_disabled', 'rabbitmq_unavailable', 'rabbitmq_confirm_timeout', 'rabbitmq_publish_failed'].includes(message) ? message : 'handler_failed'
          await logs.update(logId, { status: 'failed', finishedAt: new Date(), durationMs: Math.min(2147483647, Date.now() - startedAt.getTime()), errorCode })
        }
      }
      return this.logResponse((await logs.findOneBy({ id: logId }))!)
    }
    finally {
      if (runner.isTransactionActive)
        await runner.rollbackTransaction()
      if (handlerLocked)
        await runner.query('SELECT pg_advisory_unlock(42424,hashtext($1))', [handlerKey]).catch(() => {})
      if (locked)
        await runner.query('SELECT pg_advisory_unlock(42423,$1::int)', [id]).catch(() => {})
      await runner.release()
    }
  }

  @Cron('0 */5 * * * *', { name: 'task-log-retention', waitForCompletion: true })
  async pruneLogs() {
    const days = Number(this.config.get('TASK_LOG_RETENTION_DAYS', 30))
    const stale = await this.source.query(`SELECT DISTINCT task_id::text AS id FROM sys_task_execution WHERE status='running' AND started_at<NOW()-INTERVAL '10 minutes' LIMIT 100`)
    for (const task of stale) {
      await this.source.transaction(async (manager) => {
        const [lock] = await manager.query('SELECT pg_try_advisory_xact_lock(42423,$1::int) AS locked', [task.id])
        if (lock.locked)
          await manager.query(`UPDATE sys_task_execution SET status='failed',finished_at=NOW(),error_code='execution_interrupted' WHERE task_id=$1 AND status='running' AND started_at<NOW()-INTERVAL '10 minutes'`, [task.id])
      })
    }
    // 每实例每五分钟最多删除 1000 条，索引按 started_at 定位，无大事务。
    await this.source.query(`WITH stale AS (SELECT id FROM sys_task_execution WHERE started_at < NOW()-($1::int*INTERVAL '1 day') AND status<>'running' ORDER BY started_at LIMIT 1000 FOR UPDATE SKIP LOCKED) DELETE FROM sys_task_execution log USING stale WHERE log.id=stale.id`, [days])
  }

  async onModuleDestroy() {
    this.stopped = true
    for (const entry of this.pendingCron.values()) entry.resolve(null)
    this.pendingCron.clear()
    for (const id of this.definitions.keys()) {
      if (this.registry.doesExist('cron', `task:${id}`))
        this.registry.deleteCronJob(`task:${id}`)
    }
    await Promise.allSettled(this.active)
  }
}
