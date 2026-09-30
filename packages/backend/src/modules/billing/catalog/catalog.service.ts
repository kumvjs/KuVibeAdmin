import type { EntityManager } from 'typeorm'
import type { PromotionCandidate } from './catalog.types.js'
import type { CatalogListQueryDto, ChannelProductWriteDto, CouponCreateDto, PackageCreateDto, PackageVersionWriteDto, PromotionCreateDto, PromotionVersionWriteDto, QuoteQueryDto, QuoteResponseDto } from './dto/catalog.dto.js'
import { createHash } from 'node:crypto'
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { getBusinessDate } from '#/utils/time.util.js'
import { PG_BIGINT_MAX, positiveInteger } from '../points/points.types.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { calculateQuote, nullableLimit, salesWindow, validatePromotion } from './catalog.types.js'
import { ChannelProductEntity } from './entities/channel-product.entity.js'
import { CouponEntity, PromotionEntity, PromotionVersionEntity } from './entities/promotion.entity.js'
import { PackageVersionEntity, RechargePackageEntity } from './entities/recharge-package.entity.js'
import { RechargeUserDayEntity, RechargeUserStateEntity } from './entities/recharge-user-state.entity.js'
import { QuotaService } from './quota.service.js'

export interface ApplicablePromotion extends PromotionCandidate { versionId: string, couponId: string | null, startsAt: string, endsAt: string }
export const couponHash = (code: string) => createHash('sha256').update(code.toUpperCase()).digest('hex')

@Injectable()
export class CatalogService {
  constructor(private readonly source: DataSource, private readonly quotas: QuotaService) {}

  async createPackage(dto: PackageCreateDto, actorId: string) {
    return billingTransaction(this.source, async (manager) => {
      const stable = await manager.getRepository(RechargePackageEntity).save({ code: dto.code, status: 'draft', currentRevision: 1 })
      const version = await manager.getRepository(PackageVersionEntity).save({ ...this.packageFields(dto), packageId: stable.id, revision: 1, actorId })
      return this.packageResult(stable, version)
    })
  }

  async revisePackage(id: string, dto: PackageVersionWriteDto, actorId: string) {
    return billingTransaction(this.source, async (manager) => {
      const stable = await this.lockPackage(manager, id, 'pessimistic_write')
      const fields = this.packageFields(dto)
      await this.checkPackageLimits(manager, stable.id, fields)
      const revision = stable.currentRevision + 1
      const version = await manager.getRepository(PackageVersionEntity).save({ ...fields, packageId: id, revision, actorId })
      await manager.getRepository(RechargePackageEntity).update(id, { currentRevision: revision })
      return this.packageResult({ ...stable, currentRevision: revision }, version)
    })
  }

  async publishPackage(id: string, status: 'enabled' | 'disabled') {
    return billingTransaction(this.source, async (manager) => {
      const stable = await this.lockPackage(manager, id, 'pessimistic_write')
      const version = await manager.getRepository(PackageVersionEntity).findOneByOrFail({ packageId: id, revision: stable.currentRevision })
      if (status === 'enabled')
        await this.checkPackageLimits(manager, id, version)
      await manager.getRepository(RechargePackageEntity).update(id, { status })
      return this.packageResult({ ...stable, status }, version)
    })
  }

  async packages(query: CatalogListQueryDto, publishedOnly = false) {
    const builder = this.source.getRepository(RechargePackageEntity).createQueryBuilder('package').innerJoinAndMapOne('package.current', PackageVersionEntity, 'version', 'version.packageId = package.id AND version.revision = package.currentRevision').where('package.tenantId = 1')
    if (publishedOnly)
      builder.andWhere('package.status = :status AND (version.startsAt IS NULL OR version.startsAt <= NOW()) AND (version.endsAt IS NULL OR version.endsAt > NOW())', { status: 'enabled' })
    const [rows, total] = await builder.orderBy('package.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount()
    return { items: rows.map(row => this.packageResult(row, (row as RechargePackageEntity & { current: PackageVersionEntity }).current)), total }
  }

  async createPromotion(dto: PromotionCreateDto, actorId: string) {
    return billingTransaction(this.source, async (manager) => {
      const fields = this.promotionFields(dto)
      await this.checkPromotionPackages(manager, fields.rules.packageIds)
      const stable = await manager.getRepository(PromotionEntity).save({ code: dto.code, status: 'draft', currentRevision: 1 })
      const version = await manager.getRepository(PromotionVersionEntity).save({ ...fields, promotionId: stable.id, revision: 1, actorId })
      return this.promotionResult(stable, version)
    })
  }

  async revisePromotion(id: string, dto: PromotionVersionWriteDto, actorId: string) {
    return billingTransaction(this.source, async (manager) => {
      const stable = await this.lockPromotion(manager, id, 'pessimistic_write')
      const fields = this.promotionFields(dto)
      await this.checkPromotionPackages(manager, fields.rules.packageIds)
      await this.checkPromotionLimits(manager, id, fields.rules)
      const revision = stable.currentRevision + 1
      const version = await manager.getRepository(PromotionVersionEntity).save({ ...fields, promotionId: id, revision, actorId })
      await manager.getRepository(PromotionEntity).update(id, { currentRevision: revision })
      return this.promotionResult({ ...stable, currentRevision: revision }, version)
    })
  }

  async publishPromotion(id: string, status: 'enabled' | 'disabled') {
    return billingTransaction(this.source, async (manager) => {
      const stable = await this.lockPromotion(manager, id, 'pessimistic_write')
      const version = await manager.getRepository(PromotionVersionEntity).findOneByOrFail({ promotionId: id, revision: stable.currentRevision })
      if (status === 'enabled')
        await this.checkPromotionLimits(manager, id, version.rules)
      await manager.getRepository(PromotionEntity).update(id, { status })
      return this.promotionResult({ ...stable, status }, version)
    })
  }

  async promotions(query: CatalogListQueryDto) {
    const [rows, total] = await this.source.getRepository(PromotionEntity).createQueryBuilder('promotion').innerJoinAndMapOne('promotion.current', PromotionVersionEntity, 'version', 'version.promotionId = promotion.id AND version.revision = promotion.currentRevision').where('promotion.tenantId = 1').orderBy('promotion.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount()
    return { items: rows.map(row => this.promotionResult(row, (row as PromotionEntity & { current: PromotionVersionEntity }).current)), total }
  }

  async createCoupon(dto: CouponCreateDto, actorId: string) {
    return billingTransaction(this.source, async (manager) => {
      const promotion = await this.lockPromotion(manager, dto.promotionId, 'pessimistic_read')
      const version = await manager.getRepository(PromotionVersionEntity).findOneByOrFail({ promotionId: promotion.id, revision: promotion.currentRevision })
      if (!version.rules.requiresCoupon)
        throw new UnprocessableEntityException('该活动未要求券码')
      const { startsAt, endsAt } = salesWindow(dto.startsAt, dto.endsAt)
      if (!startsAt || !endsAt || startsAt < version.startsAt || endsAt > version.endsAt)
        throw new UnprocessableEntityException('券有效期必须位于绑定活动版本的有效期内')
      if (dto.userId)
        await this.requireUser(manager, dto.userId)
      const coupon = await manager.getRepository(CouponEntity).save({ promotionId: promotion.id, versionId: version.id, codeHash: couponHash(dto.code), userId: dto.userId ?? null, totalLimit: nullableLimit(dto.totalLimit, 'totalLimit'), startsAt, endsAt, actorId })
      return { id: coupon.id, promotionId: coupon.promotionId, versionId: coupon.versionId, userId: coupon.userId, totalLimit: coupon.totalLimit, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
    })
  }

  async mapProduct(dto: ChannelProductWriteDto, actorId: string) {
    return billingTransaction(this.source, async (manager) => {
      positiveInteger(dto.versionId, 'versionId')
      const version = await manager.getRepository(PackageVersionEntity).findOneBy({ id: dto.versionId, tenantId: '1' })
      if (!version)
        throw new NotFoundException('套餐版本不存在')
      const product = await manager.getRepository(ChannelProductEntity).save({ versionId: dto.versionId, channel: dto.channel, applicationId: dto.applicationId, environment: dto.environment, productId: dto.productId, actorId })
      return this.productResult(product)
    })
  }

  async products(versionId: string) {
    positiveInteger(versionId, 'versionId')
    const version = await this.source.getRepository(PackageVersionEntity).findOneBy({ id: versionId, tenantId: '1' })
    if (!version)
      throw new NotFoundException('套餐版本不存在')
    const { version: current } = await this.purchasablePackage(this.source.manager, version.packageId)
    if (current.id !== versionId)
      throw new NotFoundException('仅展示当前已发布套餐版本的渠道商品')
    const products = await this.source.getRepository(ChannelProductEntity).find({ where: { versionId, tenantId: '1' }, order: { id: 'ASC' } })
    return products.map(row => this.productResult(row))
  }

  async quote(packageId: string, query: QuoteQueryDto, userId: string): Promise<QuoteResponseDto> {
    const manager = this.source.manager
    const { stable, version } = await this.purchasablePackage(manager, packageId)
    const now = new Date()
    const date = getBusinessDate('Asia/Shanghai', now)
    const state = await manager.getRepository(RechargeUserStateEntity).findOneBy({ tenantId: '1', userId })
    const day = await manager.getRepository(RechargeUserDayEntity).findOneBy({ tenantId: '1', userId, businessDate: date })
    const candidates = await this.applicablePromotions(manager, stable.id, query, userId, now, !state?.firstOrderId, !day?.firstOrderId)
    const always = candidates.filter(item => item.rules.eligibility === 'always')
    const guaranteed = calculateQuote(version.priceMinor, version.basePoints, always)
    const estimated = calculateQuote(version.priceMinor, version.basePoints, candidates)
    const iap = ['apple', 'google'].includes(query.channel)
    let product: ChannelProductEntity | null = null
    if (iap) {
      if (!query.channelProductId || query.couponCode)
        throw new UnprocessableEntityException('内购须选择渠道商品，不能使用站内券码')
      positiveInteger(query.channelProductId, 'channelProductId')
      product = await manager.getRepository(ChannelProductEntity).findOneBy({ id: query.channelProductId, versionId: version.id, channel: query.channel, tenantId: '1' })
      if (!product)
        throw new UnprocessableEntityException('渠道商品不属于此套餐当前版本')
    }
    else if (query.channelProductId) {
      throw new UnprocessableEntityException('微信/支付宝不使用内购商品映射')
    }
    if (BigInt(version.basePoints) + BigInt(version.giftPoints) + BigInt(estimated.bonusPoints) > PG_BIGINT_MAX)
      throw new UnprocessableEntityException('套餐与活动赠分总额超过bigint范围')
    return {
      packageId,
      versionId: version.id,
      revision: version.revision,
      channel: query.channel,
      payableMinor: iap ? null : guaranteed.payableMinor,
      currency: iap ? null : 'CNY',
      basePoints: version.basePoints,
      packageGiftPoints: version.giftPoints,
      guaranteedBonusPoints: iap ? '0' : guaranteed.bonusPoints,
      estimatedBonusPoints: estimated.bonusPoints,
      notice: '报价不预占库存或活动预算；首单按服务端验真入账判定，内购价格由商店决定。',
      channelProductId: product?.id ?? null,
      productId: product?.productId ?? null,
      cashPromotionId: guaranteed.cash?.id ?? null,
      bonusPromotionId: estimated.bonus?.id ?? null,
    }
  }

  /** 订单调用时须先按固定顺序锁配置，再重新计算报价；查询报价仅供展示。 */
  async applicablePromotions(manager: EntityManager, packageId: string, query: QuoteQueryDto, userId: string, now: Date, firstUser: boolean, firstDay: boolean, lockedIds?: string[]): Promise<ApplicablePromotion[]> {
    let coupon: CouponEntity | null = null
    if (query.couponCode) {
      coupon = await manager.getRepository(CouponEntity).findOneBy({ tenantId: '1', codeHash: couponHash(query.couponCode) })
      if (!coupon || (coupon.userId !== null && coupon.userId !== userId) || coupon.startsAt > now || coupon.endsAt <= now)
        throw new UnprocessableEntityException('券码无效、已过期或不属于本人')
    }
    const builder = manager.getRepository(PromotionEntity).createQueryBuilder('promotion').innerJoinAndMapOne('promotion.current', PromotionVersionEntity, 'version', 'version.promotionId = promotion.id AND version.revision = promotion.currentRevision').where('promotion.tenantId = 1 AND promotion.status = :status', { status: 'enabled' })
    if (lockedIds)
      builder.andWhere(lockedIds.length ? 'promotion.id IN (:...lockedIds)' : 'FALSE', { lockedIds })
    const rows = await builder.orderBy('promotion.id', 'ASC').getMany()
    const result: ApplicablePromotion[] = []
    for (const row of rows) {
      let version = (row as PromotionEntity & { current: PromotionVersionEntity }).current
      const currentRules = version.rules
      if (coupon?.promotionId === row.id)
        version = await manager.getRepository(PromotionVersionEntity).findOneByOrFail({ id: coupon.versionId })
      const rules = { ...version.rules }
      // 券冻结优惠权益；运营降额仍约束旧券，不能通过旧版本扩大当前预算。
      for (const key of ['totalUses', 'userTotalUses', 'userDailyUses', 'cashBudget', 'pointsBudget'] as const) {
        const currentLimit = currentRules[key]
        if (currentLimit !== null && (rules[key] === null || BigInt(currentLimit) < BigInt(rules[key]!)))
          rules[key] = currentLimit
      }
      if (version.startsAt > now || version.endsAt <= now || !rules.channels.includes(query.channel) || (rules.packageIds.length > 0 && !rules.packageIds.includes(packageId)))
        continue
      if (rules.requiresCoupon && coupon?.promotionId !== row.id)
        continue
      if ((rules.eligibility === 'first_user' && !firstUser) || (rules.eligibility === 'first_day' && !firstDay))
        continue
      result.push({ id: row.id, revision: version.revision, versionId: version.id, rules, startsAt: version.startsAt.toISOString(), endsAt: version.endsAt.toISOString(), couponId: rules.requiresCoupon ? coupon!.id : null })
    }
    if (coupon && !result.some(item => item.couponId === coupon!.id))
      throw new UnprocessableEntityException('券关联活动未发布或不满足适用范围与资格')
    return result
  }

  async purchasablePackage(manager: EntityManager, id: string) {
    positiveInteger(id, 'packageId')
    const stable = await manager.getRepository(RechargePackageEntity).findOneBy({ id, tenantId: '1' })
    if (!stable || stable.status !== 'enabled')
      throw new NotFoundException('套餐不存在或未发布')
    const version = await manager.getRepository(PackageVersionEntity).findOneByOrFail({ packageId: id, revision: stable.currentRevision })
    const now = new Date()
    if ((version.startsAt && version.startsAt > now) || (version.endsAt && version.endsAt <= now))
      throw new ConflictException('套餐尚未开始或已结束')
    return { stable, version }
  }

  async lockPackage(manager: EntityManager, id: string, mode: 'pessimistic_read' | 'pessimistic_write') {
    positiveInteger(id, 'packageId')
    const row = await manager.getRepository(RechargePackageEntity).createQueryBuilder('package').where('package.id = :id AND package.tenantId = 1', { id }).setLock(mode).getOne()
    if (!row)
      throw new NotFoundException('套餐不存在')
    return row
  }

  async lockPromotion(manager: EntityManager, id: string, mode: 'pessimistic_read' | 'pessimistic_write') {
    positiveInteger(id, 'promotionId')
    const row = await manager.getRepository(PromotionEntity).createQueryBuilder('promotion').where('promotion.id = :id AND promotion.tenantId = 1', { id }).setLock(mode).getOne()
    if (!row)
      throw new NotFoundException('活动不存在')
    return row
  }

  async requireUser(manager: EntityManager, id: string) {
    positiveInteger(id, 'userId')
    const user = await manager.getRepository(SysUserEntity).createQueryBuilder('user').where('user.id = :id AND user.tenantId = 1', { id }).setLock('pessimistic_read').getOne()
    if (!user || user.status !== 1)
      throw new UnprocessableEntityException('用户不存在或已停用')
    return user
  }

  private packageFields(dto: PackageVersionWriteDto) {
    if (!dto.title.trim())
      throw new UnprocessableEntityException('套餐标题不能为空')
    positiveInteger(dto.priceMinor, 'priceMinor')
    positiveInteger(dto.basePoints, 'basePoints')
    const giftPoints = nullableLimit(dto.giftPoints, 'giftPoints') ?? '0'
    if (BigInt(dto.basePoints) + BigInt(giftPoints) > PG_BIGINT_MAX)
      throw new UnprocessableEntityException('套餐积分总额超出bigint范围')
    return {
      title: dto.title.trim(),
      priceMinor: dto.priceMinor,
      basePoints: dto.basePoints,
      giftPoints,
      ...salesWindow(dto.startsAt, dto.endsAt),
      totalLimit: nullableLimit(dto.totalLimit, 'totalLimit'),
      dailyLimit: nullableLimit(dto.dailyLimit, 'dailyLimit'),
      userTotalLimit: nullableLimit(dto.userTotalLimit, 'userTotalLimit'),
      userDailyLimit: nullableLimit(dto.userDailyLimit, 'userDailyLimit'),
    }
  }

  private promotionFields(dto: PromotionVersionWriteDto) {
    if (!dto.title.trim())
      throw new UnprocessableEntityException('活动标题不能为空')
    const { startsAt, endsAt } = salesWindow(dto.startsAt, dto.endsAt)
    if (!startsAt || !endsAt)
      throw new UnprocessableEntityException('活动必须指定开始和结束时间')
    const rules = validatePromotion({
      effect: dto.effect,
      value: dto.value,
      eligibility: dto.eligibility,
      channels: dto.channels,
      packageIds: dto.packageIds,
      minimumMinor: dto.minimumMinor,
      requiresCoupon: dto.requiresCoupon,
      priority: dto.priority,
      totalUses: dto.totalUses ?? null,
      userTotalUses: dto.userTotalUses ?? null,
      userDailyUses: dto.userDailyUses ?? null,
      cashBudget: dto.cashBudget ?? null,
      pointsBudget: dto.pointsBudget ?? null,
    })
    return { title: dto.title.trim(), startsAt, endsAt, rules }
  }

  private async checkPromotionPackages(manager: EntityManager, ids: string[]) {
    for (const id of ids) {
      if (!await manager.getRepository(RechargePackageEntity).existsBy({ id, tenantId: '1' }))
        throw new UnprocessableEntityException(`活动绑定的套餐${id}不存在`)
    }
  }

  private async checkPackageLimits(manager: EntityManager, id: string, fields: Pick<PackageVersionEntity, 'totalLimit' | 'dailyLimit' | 'userTotalLimit' | 'userDailyLimit'>) {
    for (const [key, limit] of [
      [`package:${id}:total`, fields.totalLimit],
      [`package:${id}:daily`, fields.dailyLimit],
      [`package:${id}:user:%:total`, fields.userTotalLimit],
      [`package:${id}:user:%:daily`, fields.userDailyLimit],
    ] as const)
      await this.quotas.checkLimit(manager, key, limit, key.endsWith(':daily') ? getBusinessDate('Asia/Shanghai') : undefined)
  }

  private async checkPromotionLimits(manager: EntityManager, id: string, rules: PromotionVersionEntity['rules']) {
    for (const [key, limit] of [
      [`promotion:${id}:total`, rules.totalUses],
      [`promotion:${id}:user:%:total`, rules.userTotalUses],
      [`promotion:${id}:user:%:daily`, rules.userDailyUses],
      [`promotion:${id}:cash`, rules.cashBudget],
      [`promotion:${id}:points`, rules.pointsBudget],
    ] as const)
      await this.quotas.checkLimit(manager, key, limit, key.endsWith(':daily') ? getBusinessDate('Asia/Shanghai') : undefined)
  }

  private packageResult(stable: RechargePackageEntity, version: PackageVersionEntity) {
    return {
      id: stable.id,
      code: stable.code,
      status: stable.status,
      versionId: version.id,
      revision: version.revision,
      title: version.title,
      priceMinor: version.priceMinor,
      basePoints: version.basePoints,
      giftPoints: version.giftPoints,
      startsAt: version.startsAt?.toISOString() ?? null,
      endsAt: version.endsAt?.toISOString() ?? null,
      totalLimit: version.totalLimit,
      dailyLimit: version.dailyLimit,
      userTotalLimit: version.userTotalLimit,
      userDailyLimit: version.userDailyLimit,
    }
  }

  private promotionResult(stable: PromotionEntity, version: PromotionVersionEntity) {
    return { id: stable.id, code: stable.code, status: stable.status, versionId: version.id, revision: version.revision, title: version.title, startsAt: version.startsAt.toISOString(), endsAt: version.endsAt.toISOString(), ...version.rules }
  }

  private productResult(product: ChannelProductEntity) {
    return { id: product.id, versionId: product.versionId, channel: product.channel, applicationId: product.applicationId, environment: product.environment, productId: product.productId }
  }
}
