import type { EntityManager } from 'typeorm'
import { RechargePackageStreakEntity } from './entities/recharge-package-streak.entity.js'

export interface RechargeStreak { lastBusinessDate: string, consecutiveDays: number }

export function previousBusinessDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
}

/** 日期已经按业务时区确定；同日不递增，断日从1开始。 */
export function nextRechargeStreak(previous: RechargeStreak | null, date: string) {
  const firstOfDay = previous?.lastBusinessDate !== date
  const consecutiveDays = !previous
    ? 1
    : !firstOfDay
        ? previous.consecutiveDays
        : previous.lastBusinessDate === previousBusinessDate(date) ? previous.consecutiveDays + 1 : 1
  return { lastBusinessDate: date, consecutiveDays, firstOfDay }
}

/** 旧订单是权威事实；只有尚未保存套餐连续状态时回放，退款记录仍计入。 */
export async function readRechargeStreak(manager: EntityManager, userId: string, packageId: string): Promise<RechargeStreak | null> {
  const state = await manager.getRepository(RechargePackageStreakEntity).findOneBy({ tenantId: '1', userId, packageId })
  if (state)
    return state
  const [history] = await manager.query(`WITH days AS (
    SELECT DISTINCT (settled_at AT TIME ZONE 'Asia/Shanghai')::date AS date
    FROM biz_recharge_order WHERE tenant_id=1 AND user_id=$1 AND package_id=$2
      AND paid_ledger_id IS NOT NULL AND settled_at IS NOT NULL
  ), ranked AS (
    SELECT date, max(date) OVER () AS last_date, row_number() OVER (ORDER BY date DESC)::integer AS rank FROM days
  ) SELECT max(last_date)::text AS "lastBusinessDate", count(*)::integer AS "consecutiveDays"
    FROM ranked WHERE last_date-date=rank-1`, [userId, packageId])
  return history?.lastBusinessDate ? history : null
}

/** 调用者已持有充值用户锁；与积分及订单状态同事务提交。 */
export async function saveRechargeStreak(manager: EntityManager, userId: string, packageId: string, streak: RechargeStreak) {
  await manager.getRepository(RechargePackageStreakEntity).upsert({ userId, packageId, lastBusinessDate: streak.lastBusinessDate, consecutiveDays: streak.consecutiveDays }, ['tenantId', 'userId', 'packageId'])
}
