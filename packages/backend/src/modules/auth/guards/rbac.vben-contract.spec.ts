import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import type { AuthService } from '../auth.service.js'
import { Roles } from '../auth.constant.js'
import { RbacGuard } from './rbac.guard.js'

jest.mock('#/config/index.js', () => ({
  APP_CONFIG: { KEY: 'appConfig' },
  isProd: false,
  securityConfig: { KEY: 'securityConfig' },
}))

describe('vben permission guard contract', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  }
  const authService = {
    getEffectivePermissionsByUserId: jest.fn(),
  }
  const guard = new RbacGuard(
    reflector as unknown as Reflector,
    authService as unknown as AuthService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('authorizes against the same cache-backed effective codes returned to Vben', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce('system:user:list')
    authService.getEffectivePermissionsByUserId.mockResolvedValue(['system:user:list'])
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          user: {
            roleCodes: ['admin'],
            uid: '42',
            user: { role: 'admin' },
          },
        }),
      }),
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(authService.getEffectivePermissionsByUserId).toHaveBeenCalledWith('42')
  })

  it('does not grant the super bypass from the legacy user role field', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce('system:user:list')
    authService.getEffectivePermissionsByUserId.mockResolvedValue([])
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          user: {
            roleCodes: ['admin'],
            uid: '42',
            user: { role: Roles.SUPER },
          },
        }),
      }),
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).rejects.toBeDefined()
    expect(authService.getEffectivePermissionsByUserId).toHaveBeenCalledWith('42')
  })
})
