import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { isProd } from '#/config/index.js'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger = new Logger(LoggingInterceptor.name, { timestamp: false })

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> {
    const call$ = next.handle()
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const response = context.switchToHttp().getResponse<FastifyReply>()

    const isSse = request.headers.accept === 'text/event-stream'
    this.logger.debug({
      type: 'request',
      method: request.method,
      url: request.url,
      body: request.body,
    })
    const now = Date.now()

    return call$.pipe(
      tap((data) => { // data 是控制器返回的响应内容
        if (isSse)
          return
        this.logger.debug({
          type: 'response',
          method: request.method,
          url: request.url,
          data,
          cost: `${Date.now() - now}ms`,
        })
      },
      ),
    )
  }
}
