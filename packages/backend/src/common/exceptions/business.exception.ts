// src/common/exceptions/business.exception.ts

import { HttpException, HttpStatus } from '@nestjs/common'
import { ErrorCodeItem } from '../constants/error-code.constant.js'

export class BusinessException extends HttpException {
  readonly errorCode: string

  constructor(error: ErrorCodeItem, message?: string, statusCode?: HttpStatus) {
    const msg = message ?? error.message ?? '未知错误'
    super(
      {
        code: error.code,
        message: msg,
        success: false,
        timestamp: Date.now(),
      },
      statusCode ?? (error?.httpStatus || HttpStatus.BAD_REQUEST), // 允许动态传入
    )
    this.errorCode = `${error.code}`
  }

  getErrorCode(): number {
    return +this.errorCode
  }
}
