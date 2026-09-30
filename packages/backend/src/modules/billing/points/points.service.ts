import type { PointCommand } from './points.types.js'
import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { DataSource, EntityManager, In, LessThan } from 'typeorm'
import { UserStatus } from '#/modules/system/sys-user/sys-user.types.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { PointAccountEntity } from './entities/point-account.entity.js'
import { PointAllocationEntity } from './entities/point-allocation.entity.js'
import { PointHoldEntity, PointHoldItemEntity } from './entities/point-hold.entity.js'
import { PointLedgerEntity } from './entities/point-ledger.entity.js'
import { PointLotEntity } from './entities/point-lot.entity.js'
import { PG_BIGINT_MAX, pointFingerprint, positiveInteger, validatePointCommand } from './points.types.js'

interface Allocation { lotId: string, amount: bigint }

@Injectable()
export class PointsService {
  constructor(private readonly source: DataSource) {}

  async account(userId: string) {
    positiveInteger(userId, 'userId')
    const account = await this.source.getRepository(PointAccountEntity).findOneBy({ tenantId: '1', userId })
    return {
      userId,
      accountId: account?.id ?? null,
      available: account?.available ?? '0',
      frozen: account?.frozen ?? '0',
      sequence: account?.sequence ?? '0',
      status: account?.status ?? 'active',
    }
  }

  async ledger(userId: string, cursor?: string, limit = 20) {
    positiveInteger(userId, 'userId')
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ConflictException('流水页大小必须为1–100')
    if (cursor !== undefined)
      positiveInteger(cursor, 'cursor')
    const account = await this.source.getRepository(PointAccountEntity).findOneBy({ tenantId: '1', userId })
    if (!account)
      return { items: [], nextCursor: null }
    const rows = await this.source.getRepository(PointLedgerEntity).find({
      where: { accountId: account.id, ...(cursor ? { sequence: LessThan(cursor) } : {}) },
      order: { sequence: 'DESC' },
      take: limit + 1,
    })
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const items = await Promise.all(page.map(row => this.result(this.source.manager, row)))
    return { items, nextCursor: hasMore ? page.at(-1)!.sequence : null }
  }

  /** 公共事务入口；外部支付等聚合可复用 executeInTransaction 原子履约。 */
  async execute(command: PointCommand) {
    validatePointCommand(command)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.source.transaction('READ COMMITTED', async (manager) => {
          await manager.query('SET LOCAL lock_timeout = \'1s\'')
          await manager.query('SET LOCAL statement_timeout = \'3s\'')
          return this.executeInTransaction(manager, command)
        })
      }
      catch (error) {
        const code = (error as { driverError?: { code?: string }, code?: string }).driverError?.code
          ?? (error as { code?: string }).code
        if (!['40001', '40P01'].includes(code ?? '')) {
          if (['55P03', '57014'].includes(code ?? ''))
            throw new ServiceUnavailableException('积分操作繁忙，请使用原幂等键重试')
          throw error
        }
        if (attempt === 2)
          throw new ServiceUnavailableException('积分操作竞争，请使用原幂等键重试')
        await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt + Math.random() * 20))
      }
    }
    throw new ServiceUnavailableException('积分操作暂不可用')
  }

  /** 调用方须先按项目锁序锁定用户；trustedUserLocked仅供内部已持锁聚合使用。 */
  async executeInTransaction(manager: EntityManager, command: PointCommand, options: { trustedUserLocked?: boolean, allowInactive?: boolean, sourceGrantIds?: string[] } = {}) {
    validatePointCommand(command)
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('积分写入必须在数据库事务中执行')
    if (!options.trustedUserLocked) {
      const user = await manager.getRepository(SysUserEntity).findOne({
        where: { id: command.userId, tenantId: '1' },
        withDeleted: true,
        lock: { mode: 'pessimistic_read' },
      })
      if (!user)
        throw new NotFoundException('积分用户不存在')
      if (!options.allowInactive && (user.deletedAt || user.status !== UserStatus.ENABLED))
        throw new ForbiddenException('用户已停用或删除，不能操作积分')
    }
    const accounts = manager.getRepository(PointAccountEntity)
    await accounts.createQueryBuilder().insert().values({ userId: command.userId, tenantId: '1' }).orIgnore().execute()
    const account = await accounts.findOneOrFail({ where: { userId: command.userId, tenantId: '1' }, lock: { mode: 'pessimistic_write' } })
    const key = `${command.userId}:${command.businessKey}`
    const sources = options.sourceGrantIds?.slice()
    if (sources) {
      if (!['debit', 'freeze', 'capture'].includes(command.action) || sources.length < 1 || sources.length > 2 || new Set(sources).size !== sources.length)
        throw new Error('定向扣回只允许原订单的一至两个发放批次')
      for (const id of sources)
        positiveInteger(id, 'sourceGrantId')
      sources.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)
    }
    const hash = sources ? createHash('sha256').update(`${pointFingerprint(command)}:source:${JSON.stringify(sources)}`).digest('hex') : pointFingerprint(command)
    const ledgers = manager.getRepository(PointLedgerEntity)
    const duplicate = await ledgers.findOneBy({ tenantId: '1', businessType: command.businessType, businessKey: key })
    if (duplicate) {
      if (duplicate.requestHash !== hash || duplicate.accountId !== account.id)
        throw new ConflictException('幂等键已用于不同积分操作')
      return this.result(manager, duplicate)
    }
    if (!options.allowInactive && account.status !== 'active')
      throw new ForbiddenException('积分账户已冻结操作')
    const amount = BigInt(command.amount)
    const available = BigInt(account.available)
    const frozen = BigInt(account.frozen)
    let availableDelta = 0n
    let frozenDelta = 0n
    let allocations: Allocation[] = []
    let hold: PointHoldEntity | null = null

    switch (command.action) {
      case 'grant':
        availableDelta = amount
        break
      case 'debit':
      case 'freeze':
        if (available < amount)
          throw new ConflictException('可用积分不足')
        allocations = await this.spendLots(manager, account.id, amount, command.action === 'freeze', sources)
        availableDelta = -amount
        frozenDelta = command.action === 'freeze' ? amount : 0n
        break
      case 'capture':
      case 'unfreeze': {
        hold = await manager.getRepository(PointHoldEntity).findOne({
          where: { id: command.holdId, accountId: account.id },
          lock: { mode: 'pessimistic_write' },
        })
        if (!hold || BigInt(hold.remaining) < amount)
          throw new ConflictException('冻结凭证不存在或剩余积分不足')
        const holdLedger = await ledgers.findOneByOrFail({ id: hold.ledgerId })
        if (holdLedger.businessType === 'recharge_refund' && (!options.trustedUserLocked || command.businessType !== 'recharge_refund'))
          throw new ConflictException('退款冻结凭证仅允许原订单退款处理器核销或解冻')
        allocations = await this.releaseHold(manager, hold, amount, command.action === 'unfreeze', sources)
        frozenDelta = -amount
        availableDelta = command.action === 'unfreeze' ? amount : 0n
        break
      }
      case 'reverse': {
        const original = await ledgers.findOneBy({ id: command.referenceId, accountId: account.id })
        if (!original || !['grant', 'debit'].includes(original.action) || original.amount !== command.amount)
          throw new ConflictException('仅支持完整冲正本账户的发放或扣减流水')
        if (original.action === 'grant' && original.businessType === 'recharge')
          throw new ConflictException('充值发放须通过原订单退款或对账处理，不能单独冲正破坏订单权益')
        if (await ledgers.existsBy({ referenceId: original.id, action: 'reverse' }))
          throw new ConflictException('原流水已冲正')
        allocations = await this.reverseLots(manager, original)
        availableDelta = original.action === 'grant' ? -amount : amount
        break
      }
    }
    const afterAvailable = available + availableDelta
    const afterFrozen = frozen + frozenDelta
    if (afterAvailable < 0n || afterFrozen < 0n || afterAvailable + afterFrozen > PG_BIGINT_MAX || BigInt(account.sequence) === PG_BIGINT_MAX)
      throw new ConflictException('积分余额或流水序号超出允许范围')
    const sequence = (BigInt(account.sequence) + 1n).toString()
    const updated = await accounts.createQueryBuilder().update().set({ available: afterAvailable.toString(), frozen: afterFrozen.toString(), sequence }).where('id = :id AND sequence = :sequence', { id: account.id, sequence: account.sequence }).execute()
    if (updated.affected !== 1)
      throw new ConflictException('积分账户并发更新失败')
    const ledger = await ledgers.save(ledgers.create({
      tenantId: '1',
      accountId: account.id,
      sequence,
      action: command.action,
      amount: command.amount,
      availableDelta: availableDelta.toString(),
      frozenDelta: frozenDelta.toString(),
      availableBefore: account.available,
      availableAfter: afterAvailable.toString(),
      frozenBefore: account.frozen,
      frozenAfter: afterFrozen.toString(),
      businessType: command.businessType,
      businessKey: key,
      requestHash: hash,
      reason: command.reason,
      actorId: command.actorId,
      referenceId: command.referenceId ?? null,
      holdId: command.holdId ?? null,
      traceId: command.traceId?.slice(0, 128) ?? null,
    }))
    if (command.action === 'grant') {
      const lots = manager.getRepository(PointLotEntity)
      const lot = await lots.save(lots.create({ tenantId: '1', accountId: account.id, grantId: ledger.id, kind: command.kind ?? 'gift', initial: command.amount, available: command.amount, frozen: '0' }))
      allocations = [{ lotId: lot.id, amount }]
    }
    if (allocations.length) {
      await manager.getRepository(PointAllocationEntity).insert(allocations.map(item => ({
        tenantId: '1',
        ledgerId: ledger.id,
        lotId: item.lotId,
        amount: item.amount.toString(),
      })))
    }
    if (command.action === 'freeze') {
      const holds = manager.getRepository(PointHoldEntity)
      hold = await holds.save(holds.create({ tenantId: '1', accountId: account.id, ledgerId: ledger.id, initial: command.amount, remaining: command.amount }))
      await manager.getRepository(PointHoldItemEntity).insert(allocations.map(item => ({
        tenantId: '1',
        holdId: hold!.id,
        lotId: item.lotId,
        initial: item.amount.toString(),
        remaining: item.amount.toString(),
      })))
    }
    return this.result(manager, ledger)
  }

  private async spendLots(manager: EntityManager, accountId: string, amount: bigint, freeze: boolean, sources?: string[]): Promise<Allocation[]> {
    const repository = manager.getRepository(PointLotEntity)
    const query = repository.createQueryBuilder('lot').where('lot.account_id = :accountId AND lot.available > 0', { accountId })
    if (sources)
      query.andWhere('lot.grant_id IN (:...sources)', { sources })
    const locked = await query.orderBy('lot.id', 'ASC').setLock('pessimistic_write').getMany()
    // 先按ID锁定，再按赠分优先/FIFO分配，保持一致锁序。
    const lots = locked.sort((a, b) => a.kind === b.kind ? (BigInt(a.id) < BigInt(b.id) ? -1 : 1) : a.kind === 'gift' ? -1 : 1)
    const allocations: Allocation[] = []
    let remaining = amount
    for (const lot of lots) {
      if (!remaining)
        break
      const take = remaining < BigInt(lot.available) ? remaining : BigInt(lot.available)
      await repository.update(lot.id, { available: (BigInt(lot.available) - take).toString(), frozen: (BigInt(lot.frozen) + (freeze ? take : 0n)).toString() })
      allocations.push({ lotId: lot.id, amount: take })
      remaining -= take
    }
    if (remaining)
      throw new ConflictException('积分来源批次与余额不一致，请人工核查')
    return allocations
  }

  private async releaseHold(manager: EntityManager, hold: PointHoldEntity, amount: bigint, unfreeze: boolean, sources?: string[]): Promise<Allocation[]> {
    const itemRepository = manager.getRepository(PointHoldItemEntity)
    const items = await itemRepository.find({ where: { holdId: hold.id }, order: { lotId: 'ASC' }, lock: { mode: 'pessimistic_write' } })
    const lots = await manager.getRepository(PointLotEntity).find({ where: { id: In(items.map(item => item.lotId)), accountId: hold.accountId }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } })
    const byId = new Map(lots.map(lot => [lot.id, lot]))
    let remaining = amount
    const allocations: Allocation[] = []
    for (const item of items) {
      if (!remaining)
        break
      if (sources && !sources.includes(byId.get(item.lotId)?.grantId ?? ''))
        continue
      const take = remaining < BigInt(item.remaining) ? remaining : BigInt(item.remaining)
      if (!take)
        continue
      const lot = byId.get(item.lotId)
      if (!lot || BigInt(lot.frozen) < take)
        throw new ConflictException('冻结积分来源不一致')
      await manager.getRepository(PointLotEntity).update(lot.id, { frozen: (BigInt(lot.frozen) - take).toString(), available: (BigInt(lot.available) + (unfreeze ? take : 0n)).toString() })
      await itemRepository.update(item.id, { remaining: (BigInt(item.remaining) - take).toString() })
      allocations.push({ lotId: lot.id, amount: take })
      remaining -= take
    }
    if (remaining)
      throw new ConflictException('冻结明细不足')
    await manager.getRepository(PointHoldEntity).update(hold.id, { remaining: (BigInt(hold.remaining) - amount).toString() })
    return allocations
  }

  private async reverseLots(manager: EntityManager, original: PointLedgerEntity): Promise<Allocation[]> {
    const allocations = await manager.getRepository(PointAllocationEntity).findBy({ ledgerId: original.id })
    const repository = manager.getRepository(PointLotEntity)
    const lots = await repository.find({ where: { id: In(allocations.map(item => item.lotId)), accountId: original.accountId }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } })
    const byId = new Map(lots.map(lot => [lot.id, lot]))
    if (original.action === 'debit' && (await manager.query(`SELECT to_regclass('biz_recharge_order') IS NOT NULL AS present`))[0].present
      && (await manager.query(`SELECT EXISTS(SELECT 1 FROM biz_recharge_order WHERE status IN ('refund_pending','refunded') AND (paid_ledger_id=ANY($1::bigint[]) OR gift_ledger_id=ANY($1::bigint[]))) AS revoked`, [lots.map(lot => lot.grantId)]))[0].revoked) {
      throw new ConflictException('原扣减包含已退款或退款中的充值批次，禁止恢复已撤销权益')
    }
    if (allocations.reduce((sum, item) => sum + BigInt(item.amount), 0n) !== BigInt(original.amount))
      throw new ConflictException('原流水分配记录不完整')
    for (const item of allocations) {
      const lot = byId.get(item.lotId)
      const change = BigInt(item.amount) * (original.action === 'grant' ? -1n : 1n)
      if (!lot || BigInt(lot.available) + change < 0n || BigInt(lot.available) + BigInt(lot.frozen) + change > BigInt(lot.initial))
        throw new ConflictException('原来源积分已消费或冻结，不能自动冲正')
      await repository.update(lot.id, { available: (BigInt(lot.available) + change).toString() })
    }
    return allocations.map(item => ({ lotId: item.lotId, amount: BigInt(item.amount) }))
  }

  private async result(manager: EntityManager, row: PointLedgerEntity) {
    const holdId = row.action === 'freeze'
      ? (await manager.getRepository(PointHoldEntity).findOneBy({ ledgerId: row.id }))?.id ?? null
      : row.holdId
    return {
      id: row.id,
      sequence: row.sequence,
      action: row.action,
      amount: row.amount,
      availableDelta: row.availableDelta,
      frozenDelta: row.frozenDelta,
      availableBefore: row.availableBefore,
      availableAfter: row.availableAfter,
      frozenBefore: row.frozenBefore,
      frozenAfter: row.frozenAfter,
      businessType: row.businessType,
      businessKey: row.businessKey,
      reason: row.reason,
      actorId: row.actorId,
      referenceId: row.referenceId,
      holdId,
      createdAt: row.createdAt.toISOString(),
    }
  }
}
