import type { EntityManager } from 'typeorm'
import { ConflictException, Injectable } from '@nestjs/common'
import { PG_BIGINT_MAX, positiveInteger } from '../points/points.types.js'
import { nullableLimit } from './catalog.types.js'
import { QuotaBucketEntity } from './entities/quota-bucket.entity.js'

export interface QuotaDemand { resourceKey: string, periodKey: string, limit: string | null, amount: string }
export interface ReservedQuota { bucketId: string, amount: string }

@Injectable()
export class QuotaService {
  /** 调用方必须先锁住稳定套餐/活动配置，预占和订单记录使用同一事务。 */
  async reserve(manager: EntityManager, demands: QuotaDemand[]): Promise<ReservedQuota[]> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('额度预占必须处于事务内')
    const merged = new Map<string, QuotaDemand>()
    for (const demand of demands) {
      if (!/^[a-z0-9:_-]{1,255}$/.test(demand.resourceKey) || !/^[a-z0-9-]{1,32}$/.test(demand.periodKey))
        throw new Error('额度资源标识无效')
      positiveInteger(demand.amount, 'quotaAmount')
      nullableLimit(demand.limit, 'quotaLimit')
      const key = `${demand.resourceKey}/${demand.periodKey}`
      if (merged.has(key))
        throw new Error('重复额度资源，请调用方先合并')
      merged.set(key, demand)
    }
    const result: ReservedQuota[] = []
    const repository = manager.getRepository(QuotaBucketEntity)
    for (const [, demand] of [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      await repository.createQueryBuilder().insert().values({ resourceKey: demand.resourceKey, periodKey: demand.periodKey, limit: demand.limit, reserved: '0', sold: '0' }).orIgnore().execute()
      const bucket = await repository.createQueryBuilder('bucket')
        .where('bucket.tenantId = 1 AND bucket.resourceKey = :resource AND bucket.periodKey = :period', { resource: demand.resourceKey, period: demand.periodKey })
        .setLock('pessimistic_write')
        .getOneOrFail()
      const next = BigInt(bucket.reserved) + BigInt(demand.amount)
      const occupied = next + BigInt(bucket.sold)
      if (next > PG_BIGINT_MAX || occupied > PG_BIGINT_MAX || (demand.limit !== null && occupied > BigInt(demand.limit)))
        throw new ConflictException('套餐限量、用户限购或优惠预算已用完')
      await repository.update(bucket.id, { limit: demand.limit, reserved: next.toString() })
      result.push({ bucketId: bucket.id, amount: demand.amount })
    }
    return result
  }

  /** 只能对一次性HELD凭证调用；凭证状态由订单事务保护，不能单独重复调用。 */
  async finish(manager: EntityManager, reservations: ReservedQuota[], outcome: 'consume' | 'release') {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('额度核销必须处于事务内')
    if (reservations.length === 0)
      return
    if (new Set(reservations.map(item => item.bucketId)).size !== reservations.length)
      throw new Error('重复额度凭证')
    const repository = manager.getRepository(QuotaBucketEntity)
    const resources = await repository.createQueryBuilder('bucket').where('bucket.id IN (:...ids)', { ids: reservations.map(item => item.bucketId) }).orderBy('bucket.resourceKey', 'ASC').addOrderBy('bucket.periodKey', 'ASC').getMany()
    if (resources.length !== reservations.length)
      throw new Error('额度凭证引用的资源不存在')
    for (const resource of resources) {
      const reservation = reservations.find(item => item.bucketId === resource.id)!
      positiveInteger(reservation.amount, 'quotaAmount')
      const bucket = await repository.createQueryBuilder('bucket').where('bucket.id = :id', { id: reservation.bucketId }).setLock('pessimistic_write').getOneOrFail()
      if (BigInt(bucket.reserved) < BigInt(reservation.amount))
        throw new Error('预占额度不足，禁止重复消费或释放')
      await repository.update(bucket.id, {
        reserved: (BigInt(bucket.reserved) - BigInt(reservation.amount)).toString(),
        sold: outcome === 'consume' ? (BigInt(bucket.sold) + BigInt(reservation.amount)).toString() : bucket.sold,
      })
    }
  }

  /** 配置排他锁后检查历史各桶，修改版本不清零；用户桶在下次预占时采用新限额。 */
  async checkLimit(manager: EntityManager, resourcePattern: string, limit: string | null, periodKey?: string) {
    if (limit === null)
      return
    const [row] = await manager.query('SELECT COALESCE(MAX(reserved::numeric + sold::numeric), 0)::text AS occupied FROM biz_quota_bucket WHERE tenant_id = 1 AND resource_key LIKE $1 AND ($2::text IS NULL OR period_key = $2)', [resourcePattern, periodKey ?? null])
    if (BigInt(row.occupied) > BigInt(limit))
      throw new ConflictException('新限额低于已售和已预占数量，不能发布')
  }
}
