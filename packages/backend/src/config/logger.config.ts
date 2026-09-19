// config/logger.config.ts
import { Logger, LogLevel } from '@nestjs/common'
import { ConfigType, registerAs } from '@nestjs/config'

export const loggerRegToken = 'logger'
// 辅助函数：只有当 env 有值时才转换为布尔值，否则返回 undefined
function toBoolean(val: string | undefined): boolean | undefined {
  return val !== undefined ? val === 'true' : undefined
}
let logLevels = process.env.LOGGER_LOG_LEVELS
  ?.split(',')
  .map(v => v.trim())
  .filter(Boolean) as LogLevel[] | undefined

logLevels = logLevels?.length ? logLevels : undefined

// 处理 depth 数字转换
const depth = process.env.LOGGER_DEPTH !== undefined ? Number(process.env.LOGGER_DEPTH) : undefined

export const LOGGER_CONFIG = registerAs(loggerRegToken, () => ({
  json: toBoolean(process.env.LOGGER_JSON),
  colors: toBoolean(process.env.LOGGER_COLORS),
  timestamp: toBoolean(process.env.LOGGER_TIMESTAMP),
  compact: toBoolean(process.env.LOGGER_COMPACT),

  // 如果是空字符串或不存在，都为 undefined
  prefix: process.env.LOGGER_PREFIX || undefined,

  logLevels,
  depth,
}))

export type LoggerConfig = ConfigType<typeof LOGGER_CONFIG>
