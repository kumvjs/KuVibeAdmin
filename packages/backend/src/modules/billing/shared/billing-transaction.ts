import type { DataSource, EntityManager } from 'typeorm'
import { ConflictException, ServiceUnavailableException } from '@nestjs/common'

/** 只重试完整数据库事务；回调禁止网络调用和其他不可回滚副作用。 */
export async function billingTransaction<T>(source: DataSource, operation: (manager: EntityManager) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await source.transaction('READ COMMITTED', async (manager) => {
        await manager.query('SET LOCAL lock_timeout = \'2s\'')
        await manager.query('SET LOCAL statement_timeout = \'5s\'')
        return operation(manager)
      })
    }
    catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError?.code
      if (['40001', '40P01'].includes(code ?? '') && attempt < 2)
        continue
      if (['40001', '40P01', '55P03', '57014'].includes(code ?? ''))
        throw new ServiceUnavailableException('账务服务繁忙，请使用原幂等键重试')
      if (code === '23505')
        throw new ConflictException('业务标识已存在，请查询原记录')
      throw error
    }
  }
}
