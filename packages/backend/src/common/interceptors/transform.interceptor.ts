import type { FastifyRequest } from 'fastify'
import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import qs from 'qs'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { TraceContext } from '#/shared/logger/logger.service.js'
import { ERROR_CODES } from '../constants/error-code.constant.js'
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-response-transform.decorator.js'
import { ResOp } from '../dto/response.dto.js'

/**
 * 统一处理接口请求与响应结果，如果不需要则添加 @SkipResponseTransform 装饰器
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ResOp<T>> {
  constructor(private readonly reflector: Reflector) { }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResOp<T>> {
    const skip = this.reflector.get<boolean>(
      SKIP_RESPONSE_TRANSFORM,
      context.getHandler(),
    )

    if (skip || context.getType() !== 'http')
      return next.handle()

    const http = context.switchToHttp()
    const request = http.getRequest<FastifyRequest>()

    // 处理 query 参数，将数组参数转换为数组,如：?a[]=1&a[]=2 => { a: [1, 2] }
    request.query = qs.parse(request.url.split('?').at(1))

    return next.handle().pipe(
      map((data) => {
        // if (typeof data === 'undefined') {
        //   context.switchToHttp().getResponse().status(HttpStatus.NO_CONTENT);
        //   return data;
        // }

        return ResOp.success(data ?? null, ERROR_CODES.SUCCESS.message)
      }),
    )
  }
}
