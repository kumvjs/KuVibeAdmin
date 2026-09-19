import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'
import type { Socket } from 'socket.io'
import { Injectable, Logger } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { TraceMiddleware } from '#/common/middleware/trace.middleware.js'
import { isProd } from '#/config/index.js'
import { TraceContext } from '#/shared/logger/logger.service.js'
import { WsResOp } from '../dto/ws.dto.js'

/**
 * WebSocket Trace + Transform Interceptor
 *
 * 合并两个职责（对应 HTTP 的 TraceMiddleware + TransformInterceptor）：
 * 1. 注入 traceId 到 AsyncLocalStorage
 * 2. 将 handler 返回值 { event, data } 包装为 ResOp.success 统一结构后 emit
 *
 * Handler 约定返回 { event: string, data: any }
 * Interceptor 负责 client.emit(event, ResOp.success(data, ..., traceId))
 * 并返回 null 阻止 NestJS 框架再次自动发送原始返回值
 */
@Injectable()
export class WsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WsInterceptor.name)

  intercept(context: ExecutionContext, next: CallHandler): Observable<null> {
    const client = context.switchToWs().getClient<Socket>()

    const traceId = TraceMiddleware.extractTraceId({
      headers: client.handshake.headers as Record<string, string>,
    })
    const user = client.user

    return new Observable((subscriber) => {
      TraceContext.storage.run({ traceId, userId: user?.uid }, () => {
        const start = Date.now()

        next.handle()
          .pipe(
            tap({
              next: (result: { event: string, data?: any } | null) => {
                if (result?.event) {
                  client.emit(
                    result.event,
                    WsResOp.success(result.data ?? null, ERROR_CODES.SUCCESS.message),
                  )
                }
                if (!isProd) {
                  const duration = Date.now() - start
                  this.logger.debug(`[WS] clientId: ${client.id}, traceId: ${traceId}, userId: ${user?.uid}, duration: ${duration}ms`)
                }

                subscriber.next(null)
                subscriber.complete()
              },
              error: err => subscriber.error(err),
            }),
          )
          .subscribe()
      })
    })
  }
}
