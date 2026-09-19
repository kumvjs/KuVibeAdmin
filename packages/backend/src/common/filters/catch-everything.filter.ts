import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Socket } from 'socket.io'
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets'
import { isProd } from '#/config/index.js'
import { TraceContext } from '#/shared/logger/logger.service.js'
import { ERROR_CODES } from '../constants/error-code.constant.js'
import { ResOp } from '../dto/response.dto.js'
import { BusinessException } from '../exceptions/business.exception.js'

interface ErrorInfoType { code: number, message: string, httpStatus: number, errors: string[] }
/**
 * 统一异常过滤器 - 同时支持 HTTP 和 WebSocket
 *
 * 核心逻辑：
 * 1. 捕获所有异常（BusinessException / HttpException / WsException）
 * 2. 提取 traceId 和错误信息
 * 3. 格式化错误响应
 *
 * 差异点：
 * - HTTP: response.status(xxx).send(body)
 * - WS: client.emit('error', body)
 */
@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  private readonly logger = new Logger(CatchEverythingFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType() as string
    const { traceId, userId } = TraceContext.storage.getStore() ?? {}

    // 提取错误信息（HTTP 和 WS 共同逻辑）
    const errorInfo = this.extractErrorInfo(exception)

    // 根据上下文类型处理响应
    if (contextType === 'http') {
      this.handleHttpError(host, errorInfo, traceId, userId)
    }
    else if (contextType === 'ws') {
      this.handleWsError(host, errorInfo, traceId, userId)
    }
  }

  /**
   * 提取错误信息 - HTTP 和 WS 共同逻辑
   */
  private extractErrorInfo(exception: unknown): ErrorInfoType {
    let code: number = ERROR_CODES.ERROR.code
    let message: string = ERROR_CODES.ERROR.message
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
    const exceptionType = Object.prototype.toString.call(exception)
    if (exception instanceof BusinessException) {
      code = exception.getErrorCode()
      httpStatus = exception.getStatus()
      const errorResponse = exception.getResponse() as any
      message = errorResponse?.message || exception.message
    }
    else if (exception instanceof WsException) {
      const errorResponse = exception.getError()
      message = typeof errorResponse === 'string'
        ? errorResponse
        : (errorResponse as any)?.message || exception.message
    }
    else if (exception instanceof HttpException) {
      code = exception.getStatus()
      httpStatus = exception.getStatus()
      const errorResponse = exception.getResponse()

      message = typeof errorResponse === 'object' && errorResponse !== null
        ? (errorResponse as any).message || exception.message
        : errorResponse || exception.message
    }
    else {
      message = (exception as Error)?.message ?? message
    }

    const errors = Array.isArray(message)
      ? message
      : [message]
    return { code, message: errors[0], errors, httpStatus }
  }

  /**
   * 处理 HTTP 错误响应
   */
  private handleHttpError(
    host: ArgumentsHost,
    errorInfo: ErrorInfoType,
    traceId?: string,
    userId?: string,
  ): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<FastifyReply>()
    const request = ctx.getRequest<FastifyRequest>()
    const url = decodeURI(request.raw.url || '')

    this.logger.error(
      `[HTTP Exception] <${errorInfo.httpStatus}> traceId: ${traceId}, userId: ${userId} ${errorInfo.message} - Path: ${url}`,
    )

    const responseBody = ResOp.error(
      errorInfo.code,
      errorInfo.message,
      errorInfo.errors,
    )

    response
      .status(errorInfo.httpStatus)
      .type('application/json')
      .send(responseBody)
  }

  /**
   * 处理 WebSocket 错误响应
   */
  private handleWsError(
    host: ArgumentsHost,
    errorInfo: ErrorInfoType,
    traceId?: string,
    userId?: string,
  ): void {
    const client = host.switchToWs().getClient<Socket>()

    this.logger.error(
      `[WS Exception] <${errorInfo.httpStatus}> traceId: ${traceId}, userId: ${userId}, clientId: ${client.id} - ${errorInfo.message}`,
    )

    const responseBody = ResOp.error(
      errorInfo.code,
      errorInfo.message,
      errorInfo.errors,
    )

    client.emit('error', responseBody)
  }
}
