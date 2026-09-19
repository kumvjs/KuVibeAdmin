import { applyDecorators } from '@nestjs/common'
import { ApiSecurity } from '@nestjs/swagger'

export const API_SECURITY_AUTH = 'auth'

/**
 * like to @ApiSecurity('auth')
 */
export function ApiSecurityAuth() {
  return applyDecorators(
    ApiSecurity(API_SECURITY_AUTH),
  )
}
