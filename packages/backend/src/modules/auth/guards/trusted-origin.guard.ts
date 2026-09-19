import type { FastifyRequest } from 'fastify'
import type { BrowserSecurityConfig } from '#/config/browser-security.config.js'
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { BROWSER_SECURITY_CONFIG } from '#/config/browser-security.config.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(
    @Inject(BROWSER_SECURITY_CONFIG.KEY)
    private readonly browserSecurity: BrowserSecurityConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http')
      return true

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    if (SAFE_METHODS.has(request.method.toUpperCase()))
      return true

    const origin = request.headers.origin
    if (!origin)
      return true

    if (this.browserSecurity.allowedOrigins.includes(origin))
      return true

    throw new BusinessException(ERROR_CODES.AUTH_ORIGIN_FORBIDDEN)
  }
}
