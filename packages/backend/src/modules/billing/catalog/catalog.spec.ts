import type { PromotionRules } from './catalog.types.js'
import { calculateQuote, validatePromotion } from './catalog.types.js'
import { nextRechargeStreak } from './recharge-streak.js'

const rules = (fields: Partial<PromotionRules> = {}): PromotionRules => ({ effect: 'bonus_fixed', value: '10', eligibility: 'always', channels: ['wechat'], packageIds: [], minimumMinor: '0', requiresCoupon: false, priority: 0, totalUses: null, userTotalUses: null, userDailyUses: null, cashBudget: null, pointsBudget: null, ...fields })

describe('充值优惠领域规则', () => {
  const consecutive = (fields: Partial<PromotionRules> = {}) => rules({ effect: 'bonus_consecutive', packageIds: ['1'], maxConsecutiveDays: 3, dailyBonusPoints: ['10', '20', '30'], ...fields })

  it('连续赠送逐日配置、绑定套餐、默认每天首笔；可设0及大整数', () => {
    expect(validatePromotion(consecutive()).consecutiveGrantMode).toBe('daily_first')
    expect(validatePromotion(consecutive({ dailyBonusPoints: ['0', '9007199254740993', '1'] })).value).toBe('0')
    for (const invalid of [
      { maxConsecutiveDays: 0 },
      { maxConsecutiveDays: 367 },
      { maxConsecutiveDays: 1.5 },
      { dailyBonusPoints: ['1'] },
      { dailyBonusPoints: ['1', '-1', '1'] },
      { dailyBonusPoints: ['1', '9223372036854775808', '1'] },
      { packageIds: [] },
      { eligibility: 'first_day' as const },
    ]) expect(() => validatePromotion(consecutive(invalid))).toThrow()
  })

  it('连续活动只赠送，报价和每笔充值维持全额，即使有现金优惠或当天不再赠送', () => {
    const candidates = [
      { id: '1', revision: 1, rules: consecutive() },
      { id: '2', revision: 1, rules: rules({ effect: 'fixed_discount', value: '99' }) },
    ]
    expect(calculateQuote('100', '100', candidates)).toMatchObject({ payableMinor: '100', discountMinor: '0', bonusPoints: '0' })
    for (const [consecutiveDays, bonusPoints] of [[1, '10'], [2, '20'], [3, '30'], [4, '30'], [99, '30']] as const)
      expect(calculateQuote('100', '100', candidates, { consecutiveDays, firstOfDay: true })).toMatchObject({ payableMinor: '100', discountMinor: '0', bonusPoints })
    expect(calculateQuote('100', '100', candidates, { consecutiveDays: 2, firstOfDay: false }).bonusPoints).toBe('0')
    candidates[0].rules.consecutiveGrantMode = 'every_order'
    expect(calculateQuote('100', '100', candidates, { consecutiveDays: 2, firstOfDay: false }).bonusPoints).toBe('20')
  })

  it('同日不递增，跨月跨年及闰日连续，断一天重新开始', () => {
    expect(nextRechargeStreak(null, '2026-09-30')).toMatchObject({ consecutiveDays: 1, firstOfDay: true })
    expect(nextRechargeStreak({ lastBusinessDate: '2026-09-30', consecutiveDays: 3 }, '2026-09-30')).toMatchObject({ consecutiveDays: 3, firstOfDay: false })
    for (const [lastBusinessDate, date] of [['2026-09-30', '2026-10-01'], ['2026-12-31', '2027-01-01'], ['2028-02-28', '2028-02-29'], ['2028-02-29', '2028-03-01']])
      expect(nextRechargeStreak({ lastBusinessDate, consecutiveDays: 3 }, date)).toMatchObject({ consecutiveDays: 4, firstOfDay: true })
    expect(nextRechargeStreak({ lastBusinessDate: '2026-09-28', consecutiveDays: 99 }, '2026-09-30')).toMatchObject({ consecutiveDays: 1, firstOfDay: true })
  })
  it('跨渠道首单只支持赠分，内购禁止站内现金券和人民币门槛', () => {
    expect(() => validatePromotion(rules({ effect: 'fixed_discount', eligibility: 'first_user' }))).toThrow('首单')
    expect(() => validatePromotion(rules({ effect: 'discount_bps', channels: ['google'] }))).toThrow('内购')
    expect(() => validatePromotion(rules({ channels: ['apple'], requiresCoupon: true }))).toThrow('内购')
    expect(() => validatePromotion(rules({ channels: ['apple'], minimumMinor: '1' }))).toThrow('内购')
    expect(validatePromotion(rules({ channels: ['apple', 'google'], eligibility: 'first_day' })).eligibility).toBe('first_day')
  })

  it('整数分向下取整，最低支付1分；现金和赠分各选最优一项', () => {
    const candidates = [
      { id: '1', revision: 1, rules: rules({ effect: 'discount_bps', value: '9000' }) },
      { id: '2', revision: 1, rules: rules({ effect: 'fixed_discount', value: '1000' }) },
      { id: '3', revision: 1, rules: rules({ effect: 'bonus_bps', value: '5000' }) },
      { id: '4', revision: 1, rules: rules({ value: '20' }) },
    ]
    expect(calculateQuote('101', '101', [candidates[0]])).toMatchObject({ payableMinor: '90', discountMinor: '11' })
    expect(calculateQuote('101', '101', candidates)).toMatchObject({ payableMinor: '1', bonusPoints: '50', cash: { id: '2' }, bonus: { id: '3' } })
  })

  it('不以Number处理中间结果，同优惠值按优先级和稳定ID打破平局', () => {
    const candidates = [
      { id: '3', revision: 1, rules: rules({ value: '9007199254740993' }) },
      { id: '2', revision: 1, rules: rules({ value: '9007199254740993', priority: 1 }) },
      { id: '1', revision: 1, rules: rules({ value: '9007199254740993', priority: 1 }) },
    ]
    expect(calculateQuote('9007199254740993', '100', candidates)).toMatchObject({ payableMinor: '9007199254740993', bonusPoints: '9007199254740993', bonus: { id: '1' } })
  })

  it('门槛按原价，限额0与null语义不同，比例不能超过100%', () => {
    expect(calculateQuote('100', '100', [{ id: '1', revision: 1, rules: rules({ minimumMinor: '101' }) }]).bonusPoints).toBe('0')
    expect(validatePromotion(rules({ totalUses: '0' })).totalUses).toBe('0')
    expect(validatePromotion(rules()).totalUses).toBeNull()
    expect(() => validatePromotion(rules({ effect: 'bonus_bps', value: '10001' }))).toThrow('比例')
  })
})
