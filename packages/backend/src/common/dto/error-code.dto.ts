import { ApiProperty } from '@nestjs/swagger'
import { ERROR_CODES } from '../constants/error-code.constant.js'

export class ErrorCodeDto {
  @ApiProperty({
    enum: Object.values(ERROR_CODES).map(v => v.code),
    enumName: 'ErrorCode',
    description: '业务错误码',
  })
  code: number

  @ApiProperty({
    example: ERROR_CODES.TOOL_GENERATE_RANDOM_STRING_LENGTH_ERROR.message,
  })
  message: string
}
