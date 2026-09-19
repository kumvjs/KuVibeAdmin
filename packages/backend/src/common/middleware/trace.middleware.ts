import { randomUUID } from 'node:crypto'
import { Injectable, NestMiddleware } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { TraceContext } from '#/shared/logger/logger.service.js'

/**
 * TraceMiddleware - 同时支持 HTTP 和 WebSocket
 *
 * 功能：
 * 1. 提取或生成 traceId
 * 2. 注入到 AsyncLocalStorage
 * 3. 添加到响应头（HTTP）
 *
 * 差异点：
 * - HTTP: 通过 middleware 注入，全局生效
 * - WebSocket: 通过 interceptor 注入，每条消息生效
 *
 * TraceId 提取优先级：
 * 1. x-trace-id header
 * 2. x-request-id header
 * 3. 生成新的 UUID
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    const traceId = TraceMiddleware.extractTraceId(req)
    req.headers['x-trace-id'] = traceId
    res.setHeader('x-trace-id', traceId)

    TraceContext.storage.run({ traceId }, () => next())
  }

  /**
   * 提取 traceId - 可被 WebSocket Interceptor 复用
   */
  static extractTraceId(source: {
    headers: Record<string, string | string[] | undefined>
  }): string {
    return (source.headers['x-trace-id'] as string)
      || (source.headers['x-request-id'] as string)
      || randomUUID()
  }
}
