import type { FastifyReply, FastifyRequest } from 'fastify'
import type { BrowserSecurityConfig, SecurityConfig } from '#/config/index.js'
import type { AuthService } from './auth.service.js'
import type { CaptchaService } from './services/captcha.service.js'
import { HttpStatus } from '@nestjs/common'
import { ResOp } from '#/common/dto/response.dto.js'
import { AuthController } from './auth.controller.js'

jest.mock('#/config/index.js', () => ({
  APP_CONFIG: { KEY: 'appConfig' },
  BROWSER_SECURITY_CONFIG: { KEY: 'browserSecurityConfig' },
  securityConfig: { KEY: 'securityConfig' },
}))

describe('vben authentication contract', () => {
  const authService = {
    clearLoginStatus: jest.fn(),
    getEffectivePermissionsByUserId: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
  }
  const reply = {
    clearCookie: jest.fn(),
    cookie: jest.fn(),
  }
  const security = {
    refreshExpire: 604_800,
  } as SecurityConfig
  const browserSecurity = {
    allowedOrigins: ['http://localhost:5999'],
    refreshCookie: {
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: false,
    },
  } as BrowserSecurityConfig
  const controller = new AuthController(
    authService as unknown as AuthService,
    {} as CaptchaService,
    security,
    browserSecurity,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns login data inside the canonical ResOp envelope and sets the refresh cookie', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })

    const data = await controller.login(
      { password: 'a123456', username: 'admin' },
      '127.0.0.1',
      'contract-test',
      reply as unknown as FastifyReply,
    )

    expect(data).toEqual({ accessToken: 'access-token' })
    expect(ResOp.success(data)).toMatchObject({
      code: 0,
      data: { accessToken: 'access-token' },
      message: 'success',
      success: true,
    })
    expect(reply.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-token', {
      httpOnly: true,
      maxAge: security.refreshExpire,
      path: '/api/auth',
      sameSite: 'lax',
      secure: false,
    })
  })

  it('rotates the refresh cookie while preserving ResOp<LoginTokenResponseDto>', async () => {
    authService.refreshToken.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    })
    const request = {
      cookies: { refresh_token: 'old-refresh-token' },
    } as unknown as FastifyRequest

    const data = await controller.refresh(request, reply as unknown as FastifyReply)

    expect(authService.refreshToken).toHaveBeenCalledWith('old-refresh-token')
    expect(ResOp.success(data)).toMatchObject({
      code: 0,
      data: { accessToken: 'new-access-token' },
      success: true,
    })
    expect(reply.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'new-refresh-token',
      expect.objectContaining({ httpOnly: true }),
    )
  })

  it('rejects refresh without an HttpOnly cookie as HTTP 401', async () => {
    await expect(controller.refresh(
      { cookies: {} } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    )).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    })
    expect(authService.refreshToken).not.toHaveBeenCalled()
  })

  it('delegates logout to the established token invalidation logic', async () => {
    const tokenInfo = {
      exp: Math.floor(Date.now() / 1000) + 300,
      jwtUuid: 'jwt-uuid',
      pv: 1,
      uid: '1',
    }
    authService.clearLoginStatus.mockResolvedValue(undefined)

    await expect(controller.logout(
      { tokenInfo } as LoginUserContext,
      { cookies: { refresh_token: 'refresh-token' } } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    )).resolves.toBeUndefined()
    expect(authService.clearLoginStatus).toHaveBeenCalledWith(tokenInfo, 'refresh-token')
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      browserSecurity.refreshCookie,
    )
  })

  it('clears the browser refresh cookie even when server-side logout fails', async () => {
    authService.clearLoginStatus.mockRejectedValue(new Error('storage unavailable'))

    await expect(controller.logout(
      { tokenInfo: { jwtUuid: 'jwt-uuid', pv: 1, uid: '1' } } as LoginUserContext,
      { cookies: { refresh_token: 'refresh-token' } } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    )).rejects.toThrow('storage unavailable')
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      browserSecurity.refreshCookie,
    )
  })

  it('returns effective menu/button codes inside the canonical ResOp envelope', async () => {
    authService.getEffectivePermissionsByUserId.mockResolvedValue([
      'system:user:list',
      'system:user:update',
    ])

    const data = await controller.codes({ uid: '42' } as LoginUserContext)

    expect(authService.getEffectivePermissionsByUserId).toHaveBeenCalledWith('42')
    expect(ResOp.success(data)).toMatchObject({
      code: 0,
      data: ['system:user:list', 'system:user:update'],
      success: true,
    })
  })
})
