import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import timezonePlugin from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'

// 只初始化插件，不设置全局业务时区。纯工具也可供前端复用。
dayjs.extend(utc)
dayjs.extend(timezonePlugin)
dayjs.extend(customParseFormat)

export { dayjs }

export interface TimeRange {
  startAt: Date
  /** 排他终点，数据库使用 < endAt。 */
  endAt: Date
}

/** 接受 UTC 和运行时支持的 IANA 区域/别名，不接受 GMT+8、+08:00 等偏移。 */
export function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64
    || (value !== 'UTC' && !/^[A-Z_]+(?:\/[\w+-]+)+$/i.test(value))) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
    return true
  }
  catch {
    return false
  }
}

export function assertTimezone(value: unknown): asserts value is string {
  if (!isIanaTimezone(value))
    throw new RangeError('必须提供运行时支持的 IANA 时区，例如 Asia/Shanghai')
}

/** 选项不硬编码当前 UTC 偏移；别名仍可通过 isIanaTimezone 校验。 */
export function getTimezoneIds(): string[] {
  return [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])].sort()
}

function calendarDate(value: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number(value.slice(0, 4)) < 1000) {
    throw new RangeError('日期必须是 1000–9999 年内的 YYYY-MM-DD')
  }
  const date = dayjs.utc(value, 'YYYY-MM-DD', true)
  if (!date.isValid())
    throw new RangeError('日期不存在')
  return date
}

/** 只接受 Date 或带 Z/偏移的 ISO 时间点，不猜测无时区字符串。 */
export function parseInstant(value: Date | string): Date {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw new RangeError('时间点无效')
    return new Date(value.getTime())
  }
  const match = typeof value === 'string'
    ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
    : null
  if (!match)
    throw new RangeError('时间点必须是带 Z 或偏移的 ISO 日期时间，精度最多为毫秒')
  calendarDate(match[1])
  const offset = match[6]
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59
    || (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))) {
    throw new RangeError('时间点无效')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    throw new RangeError('时间点无效')
  return date
}

export function getBusinessDate(timezone: string, now: Date = new Date()): string {
  assertTimezone(timezone)
  return dayjs(parseInstant(now)).tz(timezone).format('YYYY-MM-DD')
}

export function formatInstant(value: Date | string, timezone: string, format = 'YYYY-MM-DD HH:mm:ss Z'): string {
  assertTimezone(timezone)
  return dayjs(parseInstant(value)).tz(timezone).format(format)
}

function midnight(date: string, timezone: string): Date {
  const wallTime = `${date} 00:00:00`
  const parsed = dayjs.tz(wallTime, timezone)
  if (parsed.format('YYYY-MM-DD HH:mm:ss') !== wallTime)
    throw new RangeError(`${date} 在 ${timezone} 的零点不存在，需业务明确边界策略`)

  // 检查边界两侧的偏移，拒绝夏令时回拨产生的两个零点。
  const wallEpoch = calendarDate(date).valueOf()
  for (const hours of [-36, 36]) {
    const offset = dayjs(parsed.valueOf() + hours * 3600000).tz(timezone).utcOffset()
    const candidate = wallEpoch - offset * 60000
    if (candidate !== parsed.valueOf()
      && dayjs(candidate).tz(timezone).format('YYYY-MM-DD HH:mm:ss') === wallTime) {
      throw new RangeError(`${date} 在 ${timezone} 的零点不唯一，需业务明确边界策略`)
    }
  }
  return parsed.toDate()
}

/** startDate/endDate 都包含；返回 [startAt, endAt)，每个零点独立解析 DST 偏移。 */
export function getBusinessDateRange(startDate: string, endDate: string, timezone: string): TimeRange {
  assertTimezone(timezone)
  const start = calendarDate(startDate)
  const end = calendarDate(endDate)
  if (start.isAfter(end))
    throw new RangeError('开始日期不能晚于结束日期')
  const nextDate = end.add(1, 'day').format('YYYY-MM-DD')
  calendarDate(nextDate)
  const startAt = midnight(startDate, timezone)
  // 即使结束日期恰好是被跳过的日期，也不能静默接受。
  midnight(endDate, timezone)
  const endAt = midnight(nextDate, timezone)
  if (endAt <= startAt)
    throw new RangeError('日期范围没有有效时间区间')
  return { startAt, endAt }
}

export function getBusinessDayRange(date: string, timezone: string): TimeRange {
  return getBusinessDateRange(date, date, timezone)
}
