import type { ExecutionContext } from '@nestjs/common'
import type { BrowserSecurityConfig } from '#/config/browser-security.config.js'
import { HttpStatus } from '@nestjs/common'
import { TrustedOriginGuard } from './trusted-origin.guard.js'

function httpContext(method: string, origin?: string): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { origin },
        method,
      }),
    }),
  } as unknown as ExecutionContext
}

describe('trusted browser origin guard', () => {
  const guard = new TrustedOriginGuard({
    allowedOrigins: ['https://admin.example.com'],
    refreshCookie: {
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'none',
      secure: true,
    },
  } as BrowserSecurityConfig)

  it('allows trusted unsafe browser requests', () => {
    expect(guard.canActivate(
      httpContext('POST', 'https://admin.example.com'),
    )).toBe(true)
  })

  it('rejects untrusted unsafe browser requests with HTTP 403', () => {
    expect(() => guard.canActivate(
      httpContext('POST', 'https://attacker.example'),
    )).toThrow(expect.objectContaining({ status: HttpStatus.FORBIDDEN }))
  })

  it('allows safe, preflight, and non-browser requests', () => {
    expect(guard.canActivate(
      httpContext('GET', 'https://attacker.example'),
    )).toBe(true)
    expect(guard.canActivate(
      httpContext('OPTIONS', 'https://attacker.example'),
    )).toBe(true)
    expect(guard.canActivate(httpContext('POST'))).toBe(true)
  })
})
