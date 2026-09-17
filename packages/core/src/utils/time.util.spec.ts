import { formatInstant, getBusinessDate, getBusinessDateRange, getBusinessDayRange, getTimezoneIds, isIanaTimezone, parseInstant } from './time.util.js'

describe('统一时间工具', () => {
  it.each(['UTC', 'Asia/Shanghai', 'America/New_York', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Seoul'])('接受时区 %s', (zone) => {
    expect(isIanaTimezone(zone)).toBe(true)
    expect(getTimezoneIds()).toContain(zone)
  })

  it.each(['', 'GMT+8', '+08:00', 'CST', 'Invalid/Zone', ' Asia/Shanghai', null, undefined, 8])('拒绝无效时区 %s', (zone) => {
    expect(isIanaTimezone(zone)).toBe(false)
  })

  it('将包含结束日期的上海日期范围转换成半开时间点范围', () => {
    const { startAt, endAt } = getBusinessDateRange('2026-09-10', '2026-10-08', 'Asia/Shanghai')
    expect(startAt.toISOString()).toBe('2026-09-09T16:00:00.000Z')
    expect(endAt.toISOString()).toBe('2026-10-08T16:00:00.000Z')
  })

  it.each([
    ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
    ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
  ])('按纽约日历处理 %s', (date, start, end, hours) => {
    const range = getBusinessDayRange(date as string, 'America/New_York')
    expect(range.startAt.toISOString()).toBe(start)
    expect(range.endAt.toISOString()).toBe(end)
    expect((+range.endAt - +range.startAt) / 3600000).toBe(hours)
  })

  it('跨年和闰日使用日历运算', () => {
    expect(getBusinessDayRange('2024-02-29', 'UTC').endAt.toISOString()).toBe('2024-03-01T00:00:00.000Z')
    expect(getBusinessDayRange('2026-12-31', 'UTC').endAt.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it.each(['2026-02-30', '2026-02-29', '2026-9-17', 'not-a-date', '9999-12-31'])('拒绝非法或越界日期 %s', (date) => {
    expect(() => getBusinessDayRange(date, 'UTC')).toThrow(RangeError)
  })

  it('拒绝反向范围、跳日及不存在或重复的零点', () => {
    expect(() => getBusinessDateRange('2026-10-08', '2026-09-10', 'UTC')).toThrow(RangeError)
    expect(() => getBusinessDayRange('2011-12-30', 'Pacific/Apia')).toThrow(/不存在/)
    expect(() => getBusinessDayRange('2018-11-04', 'America/Sao_Paulo')).toThrow(/不存在/)
    expect(() => getBusinessDayRange('2026-11-01', 'America/Havana')).toThrow(/不唯一/)
  })

  it('显式时区之间不共享默认值，展示不改变时间点', async () => {
    const now = new Date('2026-09-17T00:30:00Z')
    const dates = await Promise.all(['Asia/Shanghai', 'America/New_York', 'Asia/Tokyo'].map(async zone => getBusinessDate(zone, now)))
    expect(dates).toEqual(['2026-09-17', '2026-09-16', '2026-09-17'])
    expect(formatInstant(now, 'Asia/Shanghai')).toBe('2026-09-17 08:30:00 +08:00')
    expect(now.toISOString()).toBe('2026-09-17T00:30:00.000Z')
    expect(() => getBusinessDate(undefined as unknown as string, now)).toThrow(RangeError)
  })

  it('解析明确时间点并保留毫秒', () => {
    expect(parseInstant('2026-09-17T10:00:00.123+08:00').toISOString()).toBe('2026-09-17T02:00:00.123Z')
    const date = new Date('2026-09-17T02:00:00Z')
    expect(parseInstant(date)).not.toBe(date)
  })

  it.each(['2026-09-17', '2026-09-17T10:00:00', '2026-02-30T00:00:00Z', '2026-09-17T24:00:00Z', '2026-09-17T00:00:00+24:00', '2026-09-17T00:00:00.1234Z'])('拒绝含糊或非法时间点 %s', (value) => {
    expect(() => parseInstant(value)).toThrow(RangeError)
  })
})
