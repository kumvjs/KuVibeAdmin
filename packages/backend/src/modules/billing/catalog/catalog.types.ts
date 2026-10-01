import { UnprocessableEntityException } from '@nestjs/common'
import { parseInstant } from '#/utils/time.util.js'
import { PG_BIGINT_MAX, positiveInteger } from '../points/points.types.js'

export const PAYMENT_CHANNELS = ['wechat', 'alipay', 'apple', 'google'] as const
export type PaymentChannel = typeof PAYMENT_CHANNELS[number]
export const PROMOTION_EFFECTS = ['fixed_discount', 'discount_bps', 'bonus_fixed', 'bonus_bps', 'bonus_consecutive'] as const
export const MAX_CONSECUTIVE_DAYS = 366
export type ConsecutiveGrantMode = 'daily_first' | 'every_order'
export type PromotionEffect = typeof PROMOTION_EFFECTS[number]
export type Eligibility = 'always' | 'first_user' | 'first_day'

export const CATALOG_PERMISSIONS = {
  READ: 'system:billing:catalog:read',
  WRITE: 'system:billing:catalog:write',
  PUBLISH: 'system:billing:catalog:publish',
  PROMOTION_READ: 'system:billing:promotion:read',
  PROMOTION_WRITE: 'system:billing:promotion:write',
  PROMOTION_PUBLISH: 'system:billing:promotion:publish',
} as const

export function nonnegativeInteger(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > PG_BIGINT_MAX)
    throw new UnprocessableEntityException(`${field} 必须为bigint范围内的非负整数字符串`)
  return value
}

export function nullableLimit(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : nonnegativeInteger(value, field)
}

export function salesWindow(start?: string | null, end?: string | null): { startsAt: Date | null, endsAt: Date | null } {
  try {
    const startsAt = start == null ? null : parseInstant(start)
    const endsAt = end == null ? null : parseInstant(end)
    if (startsAt && endsAt && startsAt >= endsAt)
      throw new Error('开始时间必须早于结束时间')
    return { startsAt, endsAt }
  }
  catch (error) {
    throw new UnprocessableEntityException((error as Error).message)
  }
}

export interface PromotionRules {
  effect: PromotionEffect
  value: string
  eligibility: Eligibility
  channels: PaymentChannel[]
  packageIds: string[]
  minimumMinor: string
  requiresCoupon: boolean
  priority: number
  totalUses: string | null
  userTotalUses: string | null
  userDailyUses: string | null
  cashBudget: string | null
  pointsBudget: string | null
  maxConsecutiveDays?: number
  dailyBonusPoints?: string[]
  consecutiveGrantMode?: ConsecutiveGrantMode
}

export function validatePromotion(rules: PromotionRules): PromotionRules {
  if (rules.effect === 'bonus_consecutive') {
    if (!Number.isInteger(rules.maxConsecutiveDays) || rules.maxConsecutiveDays! < 1 || rules.maxConsecutiveDays! > MAX_CONSECUTIVE_DAYS)
      throw new UnprocessableEntityException(`连续充值最大天数须为1到${MAX_CONSECUTIVE_DAYS}的整数`)
    if (!Array.isArray(rules.dailyBonusPoints) || rules.dailyBonusPoints.length !== rules.maxConsecutiveDays)
      throw new UnprocessableEntityException('连续充值须配置每一天的赠送积分，数量须等于最大天数')
    for (const value of rules.dailyBonusPoints)
      nonnegativeInteger(value, 'dailyBonusPoints')
    if (rules.eligibility !== 'always' || !rules.packageIds.length)
      throw new UnprocessableEntityException('连续充值须绑定套餐，参与条件使用所有充值')
    if (rules.consecutiveGrantMode !== undefined && !['daily_first', 'every_order'].includes(rules.consecutiveGrantMode))
      throw new UnprocessableEntityException('连续充值赠送频率无效')
    rules = { ...rules, value: rules.dailyBonusPoints[0], consecutiveGrantMode: rules.consecutiveGrantMode ?? 'daily_first' }
  }
  else {
    positiveInteger(rules.value, 'value')
    const { maxConsecutiveDays: _max, dailyBonusPoints: _daily, consecutiveGrantMode: _mode, ...ordinary } = rules
    rules = ordinary
  }
  nonnegativeInteger(rules.minimumMinor, 'minimumMinor')
  if (!PROMOTION_EFFECTS.includes(rules.effect) || !['always', 'first_user', 'first_day'].includes(rules.eligibility))
    throw new UnprocessableEntityException('优惠动作或资格类型无效')
  if (rules.effect.endsWith('bps') && BigInt(rules.value) > 10000n)
    throw new UnprocessableEntityException('优惠比例不能超过10000 basis points')
  if (rules.eligibility !== 'always' && !rules.effect.startsWith('bonus_'))
    throw new UnprocessableEntityException('跨渠道首单优惠仅支持结算赠分')
  if (!rules.channels.length || rules.channels.some(channel => !PAYMENT_CHANNELS.includes(channel)))
    throw new UnprocessableEntityException('优惠适用渠道无效')
  if (rules.channels.some(channel => ['apple', 'google'].includes(channel)) && !rules.effect.startsWith('bonus_'))
    throw new UnprocessableEntityException('站内现金优惠不能应用于内购商品')
  if (rules.channels.some(channel => ['apple', 'google'].includes(channel)) && (rules.minimumMinor !== '0' || rules.requiresCoupon))
    throw new UnprocessableEntityException('内购赠分不能使用站内现金门槛或券码')
  for (const id of rules.packageIds)
    positiveInteger(id, 'packageId')
  if (!Number.isInteger(rules.priority) || Math.abs(rules.priority) > 100000)
    throw new UnprocessableEntityException('优惠优先级无效')
  return {
    ...rules,
    channels: [...new Set(rules.channels)],
    packageIds: [...new Set(rules.packageIds)],
    totalUses: nullableLimit(rules.totalUses, 'totalUses'),
    userTotalUses: nullableLimit(rules.userTotalUses, 'userTotalUses'),
    userDailyUses: nullableLimit(rules.userDailyUses, 'userDailyUses'),
    cashBudget: nullableLimit(rules.cashBudget, 'cashBudget'),
    pointsBudget: nullableLimit(rules.pointsBudget, 'pointsBudget'),
  }
}

export interface PromotionCandidate { id: string, revision: number, rules: PromotionRules }

export interface ConsecutiveQuoteContext { consecutiveDays: number, firstOfDay: boolean }

export function consecutiveBonus(rules: PromotionRules, context?: ConsecutiveQuoteContext): bigint {
  if (!context || ((rules.consecutiveGrantMode ?? 'daily_first') === 'daily_first' && !context.firstOfDay))
    return 0n
  const index = Math.min(context.consecutiveDays, rules.maxConsecutiveDays!) - 1
  return BigInt(rules.dailyBonusPoints![index])
}

/** 纯整数报价；真实预算和首单事实须在下单/结算事务内复核。 */
export function calculateQuote(price: string, basePoints: string, candidates: PromotionCandidate[], context?: ConsecutiveQuoteContext) {
  const original = positiveInteger(price, 'priceMinor')
  const base = positiveInteger(basePoints, 'basePoints')
  const ranked = [...candidates].sort((a, b) => b.rules.priority - a.rules.priority || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
  let payable = original
  let cash: PromotionCandidate | null = null
  let bonus: PromotionCandidate | null = null
  let bonusPoints = 0n
  const fullPrice = candidates.some(item => item.rules.effect === 'bonus_consecutive')
  for (const promotion of ranked) {
    const { rules } = promotion
    if (original < BigInt(rules.minimumMinor))
      continue
    const value = BigInt(rules.value)
    if (rules.effect.startsWith('bonus_')) {
      const points = rules.effect === 'bonus_consecutive' ? consecutiveBonus(rules, context) : rules.effect === 'bonus_fixed' ? value : base * value / 10000n
      if (points > bonusPoints) {
        bonusPoints = points
        bonus = promotion
      }
    }
    else if (!fullPrice) {
      const computed = rules.effect === 'fixed_discount' ? original - value : original * value / 10000n
      const amount = computed < 1n ? 1n : computed
      if (amount < payable) {
        payable = amount
        cash = promotion
      }
    }
  }
  return { payableMinor: payable.toString(), discountMinor: (original - payable).toString(), bonusPoints: bonusPoints.toString(), cash, bonus }
}
