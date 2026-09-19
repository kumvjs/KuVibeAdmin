import type { LoggerConfig } from '#/config/logger.config.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { ConsoleLogger, ConsoleLoggerOptions, Inject, Injectable, LogLevel, Optional, Scope } from '@nestjs/common'
import { LOGGER_CONFIG } from '#/config/logger.config.js'

// ─── Trace Context (AsyncLocalStorage for per-request traceId) ───────────────
// Attach this in your middleware/interceptor before each request.
// Usage: TraceContext.storage.run({ traceId: uuid() }, () => next())
export const TraceContext = {
  storage: new AsyncLocalStorage<{ traceId?: string, userId?: string }>(),
}

export interface AppLoggerOptions extends ConsoleLoggerOptions { }

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends ConsoleLogger {
  private readonly envConfig?: LoggerConfig

  constructor()
  constructor(context: string)
  constructor(options: AppLoggerOptions)
  constructor(context: string, options: AppLoggerOptions)
  constructor(
    contextOrOptions?: string | AppLoggerOptions,
    options?: AppLoggerOptions,
    @Optional()
    @Inject(LOGGER_CONFIG.KEY)
    envConfig?: LoggerConfig,
  ) {
    const resolvedOptions: AppLoggerOptions = { ...envConfig, ...options }
    if (typeof contextOrOptions === 'string') {
      if (options) {
        super(contextOrOptions, resolvedOptions)
      }
      else {
        super(resolvedOptions)
      }
    }
    else if (contextOrOptions) {
      super({ ...contextOrOptions, ...resolvedOptions })
    }
    else {
      super(resolvedOptions)
    }
    this.envConfig = envConfig
  }

  protected override getJsonLogObject(
    message: unknown,
    options: {
      context: string
      logLevel: LogLevel
      writeStreamType?: 'stdout' | 'stderr'
      errorStack?: unknown
    },
  ) {
    const json = super.getJsonLogObject(message, options)

    const traceStore = TraceContext.storage.getStore()
    const traceData = {
      'trace.id': traceStore?.traceId,
      'user.id': traceStore?.userId,
    }

    return {
      ...traceData,
      ...json,
    }
  }

  /**
   * 将 TraceStore 格式化为纯文本日志标签
   * 输出示例：[traceId:4bf92f span:00f067 userId:u-456]
   *
   * 设计原则：
   * - 固定字段顺序，便于肉眼扫描与正则提取
   * - 仅输出有值字段，避免 undefined / null 污染
   * - 空格分隔替代逗号，与主流日志系统（Logfmt）对齐
   */
  protected formatTraceTag(traceStore): string {
    const traceData = [
      `trace.id: ${traceStore?.traceId}`,
      `user.id: ${traceStore?.userId}`,
    ]
    return traceData.length > 0 ? `[${traceData.join(' ')}]` : ''
  }

  protected override formatMessage(logLevel: LogLevel, message: unknown, pidMessage: string, formattedLogLevel: string, contextMessage: string, timestampDiff: string): string {
    const traceStore = TraceContext.storage.getStore()
    const traceTag = traceStore ? this.formatTraceTag(traceStore) : ''

    if (traceTag) {
      contextMessage = `${contextMessage} ${traceTag} `
    }
    return super.formatMessage(
      logLevel,
      message,
      pidMessage,
      formattedLogLevel,
      contextMessage,
      timestampDiff,
    )
  }
}
