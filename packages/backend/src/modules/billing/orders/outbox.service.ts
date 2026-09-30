import type { EntityManager } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { BillingOutboxEntity } from './entities/billing-outbox.entity.js'

export interface OutboxLease { id: string, type: string, aggregateId: string, payload: Record<string, string>, attempts: number, leaseToken: string }

@Injectable()
export class BillingOutboxService {
  constructor(private readonly source: DataSource) {}

  async enqueue(manager: EntityManager, type: string, aggregateId: string, businessKey: string, availableAt?: Date, payload: Record<string, string> = {}) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('outbox必须与业务在同一事务写入')
    await manager.getRepository(BillingOutboxEntity).createQueryBuilder().insert().values({ type, aggregateId, businessKey, payload, ...(availableAt ? { availableAt } : {}) }).orIgnore().execute()
  }

  /** 租约绑定每次领取，过期worker不能确认新worker的任务。 */
  async claim(types: string[], count = 10, leaseSeconds = 60): Promise<OutboxLease[]> {
    if (!types.length)
      return []
    if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300)
      throw new Error('领取批次或租期无效')
    await this.source.query(`UPDATE biz_billing_outbox SET status='dead',lease_token=NULL,leased_until=NULL,last_error='lease_exhausted' WHERE tenant_id=1 AND type=ANY($1) AND status='processing' AND leased_until<=NOW() AND attempts>=10`, [types])
    const runner = this.source.createQueryRunner()
    try {
      const result = await runner.query(`WITH candidates AS (
      SELECT id FROM biz_billing_outbox WHERE tenant_id=1 AND type=ANY($1) AND attempts<10 AND available_at<=NOW()
      AND (status='pending' OR (status='processing' AND leased_until<=NOW()))
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $2
    ) UPDATE biz_billing_outbox AS job SET status='processing',attempts=job.attempts+1,lease_token=$3,leased_until=NOW()+($4::int * INTERVAL '1 second')
      FROM candidates WHERE job.id=candidates.id RETURNING job.id::text,job.type,job.aggregate_id::text AS "aggregateId",job.payload,job.attempts,job.lease_token AS "leaseToken"`, [types, count, randomUUID(), leaseSeconds], true)
      return result.records
    }
    finally {
      await runner.release()
    }
  }

  async complete(lease: OutboxLease): Promise<boolean> {
    const result = await this.source.getRepository(BillingOutboxEntity).createQueryBuilder().update().set({ status: 'done', leaseToken: null, leasedUntil: null, lastError: null }).where('id = :id AND status = :status AND lease_token = :token AND leased_until > NOW()', { id: lease.id, status: 'processing', token: lease.leaseToken }).execute()
    return result.affected === 1
  }

  async fail(lease: OutboxLease, safeCode = 'handler_failed'): Promise<boolean> {
    if (!/^[a-z0-9_]{1,100}$/.test(safeCode))
      throw new Error('outbox错误码不能包含渠道响应或敏感数据')
    const result = await this.source.getRepository(BillingOutboxEntity).createQueryBuilder().update().set({ status: lease.attempts >= 10 ? 'dead' : 'pending', leaseToken: null, leasedUntil: null, lastError: safeCode, availableAt: () => `NOW() + INTERVAL '${Math.min(300, 2 ** lease.attempts)} seconds'` }).where('id = :id AND status = :status AND lease_token = :token AND leased_until > NOW()', { id: lease.id, status: 'processing', token: lease.leaseToken }).execute()
    return result.affected === 1
  }

  /** 渠道明确pending属于正常等待，不能计入失败死信，否则长时待付款将失去补偿。 */
  async defer(lease: OutboxLease, seconds = 60): Promise<boolean> {
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 3600)
      throw new Error('延迟任务必须为5到3600秒')
    const result = await this.source.getRepository(BillingOutboxEntity).createQueryBuilder().update().set({ status: 'pending', attempts: 0, leaseToken: null, leasedUntil: null, lastError: null, availableAt: () => `NOW() + INTERVAL '${seconds} seconds'` }).where('id=:id AND status=\'processing\' AND lease_token=:token AND leased_until>NOW()', { id: lease.id, token: lease.leaseToken }).execute()
    return result.affected === 1
  }
}
