export const CAHCE_TTL = {
  SHORT: 60, // 1分钟，空值占位
  DEFAULT: 60 * 60, // 1小时
  LONG: 60 * 60 * 24, // 1天
} as const

export const CACHE_JITTER = {
  DEFAULT: 60 * 10, // 最大抖动 ±10分钟，防雪崩
} as const

export const NULL_PLACEHOLDER = '__NULL__' // 空值占位符，防穿透
