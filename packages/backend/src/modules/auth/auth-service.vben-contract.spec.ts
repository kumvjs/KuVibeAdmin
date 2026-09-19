import type { AppConfig, SecurityConfig } from '#/config/index.js'
import type { CacheService } from '#/shared/cache/cache.service.js'
import type { LoginLogService } from '../system/log/services/login-log.service.js'
import type { MenuService } from '../system/menu/menu.service.js'
import type { UserService } from '../user/user.service.js'
import type { TokenService } from './services/token.service.js'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import {
  authKeys,
  USER_PERMISSIONS_CACHE_SCHEMA_VERSION,
} from '#/shared/cache/keys/auth.keys.js'
import { PasswordAlgorithm, UserStatus } from '../system/sys-user/sys-user.types.js'
import { AuthService } from './auth.service.js'

jest.mock('#/config/index.js', () => ({
  APP_CONFIG: { KEY: 'appConfig' },
  securityConfig: { KEY: 'securityConfig' },
}))

describe('vben auth service contracts', () => {
  const cacheService = {
    delCache: jest.fn(),
    getCache: jest.fn(),
    setCache: jest.fn(),
  }
  const menuService = {
    getPermissionsByUserId: jest.fn(),
  }
  const userService = {
    findUserForLogin: jest.fn(),
  }
  const loginLogService = {
    create: jest.fn(),
  }
  const tokenService = {
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
    removeAccessTokenByJwtUuid: jest.fn(),
    revokeRefreshToken: jest.fn(),
  }
  const security = {
    jwtExprire: 3_600,
  } as SecurityConfig
  const service = new AuthService(
    cacheService as unknown as CacheService,
    userService as unknown as UserService,
    tokenService as unknown as TokenService,
    menuService as unknown as MenuService,
    security,
    {} as AppConfig,
    loginLogService as unknown as LoginLogService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    cacheService.setCache.mockResolvedValue(undefined)
    cacheService.delCache.mockResolvedValue(undefined)
    cacheService.getCache.mockResolvedValue(undefined)
    menuService.getPermissionsByUserId.mockResolvedValue([])
    userService.findUserForLogin.mockResolvedValue(undefined)
    loginLogService.create.mockResolvedValue(undefined)
    tokenService.generateAccessToken.mockResolvedValue('access-token')
    tokenService.generateRefreshToken.mockResolvedValue('refresh-token')
    tokenService.removeAccessTokenByJwtUuid.mockResolvedValue(undefined)
    tokenService.revokeRefreshToken.mockResolvedValue(undefined)
  })

  it('blacklists the access token and revokes both server-side token states', async () => {
    const now = Math.floor(Date.now() / 1000)
    const tokenInfo: AuthUser = {
      exp: now + 300,
      jwtUuid: 'access-token-uuid',
      pv: 1,
      uid: '42',
    }

    await service.clearLoginStatus(tokenInfo, 'refresh-token')

    expect(cacheService.setCache).toHaveBeenCalledWith(
      authKeys.tokenBlacklist('access-token-uuid'),
      '1',
      expect.any(Number),
    )
    expect(tokenService.removeAccessTokenByJwtUuid).toHaveBeenCalledWith('access-token-uuid')
    expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('refresh-token')
  })

  it('keeps disabled status private when the submitted password is wrong', async () => {
    userService.findUserForLogin.mockResolvedValue({
      status: false,
      verifyPassword: () => false,
    })

    await expect(
      service.validateUser('disabled-user', 'wrong-password'),
    ).rejects.toMatchObject({
      errorCode: String(ERROR_CODES.USER_PASSWORD_ERROR.code),
    })
  })

  it('uses the same credential error for an unknown user', async () => {
    userService.findUserForLogin.mockResolvedValue(undefined)

    await expect(
      service.validateUser('unknown-user', 'any-password'),
    ).rejects.toMatchObject({
      errorCode: String(ERROR_CODES.USER_PASSWORD_ERROR.code),
    })
  })

  it('rejects a disabled user before issuing tokens or writing login state', async () => {
    userService.findUserForLogin.mockResolvedValue({
      id: '42',
      passwordAlgorithm: PasswordAlgorithm.ARGON2ID,
      passwordHash: 'argon2-hash',
      sessionVersion: 1,
      status: UserStatus.DISABLED,
      verifyPassword: () => true,
    })

    await expect(service.login(
      'disabled-user',
      'correct-password',
      '127.0.0.1',
      'contract-test',
    )).rejects.toMatchObject({
      errorCode: String(ERROR_CODES.USER_ACCOUNT_DISABLED.code),
    })

    expect(tokenService.generateAccessToken).not.toHaveBeenCalled()
    expect(tokenService.generateRefreshToken).not.toHaveBeenCalled()
    expect(cacheService.setCache).not.toHaveBeenCalled()
    expect(loginLogService.create).not.toHaveBeenCalled()
  })

  it('returns only the authentication state after password validation', async () => {
    userService.findUserForLogin.mockResolvedValue({
      id: '42',
      passwordAlgorithm: PasswordAlgorithm.ARGON2ID,
      passwordHash: 'argon2-hash',
      sessionVersion: 3,
      status: UserStatus.ENABLED,
      username: 'enabled-user',
      verifyPassword: () => true,
    })

    const validated = await service.validateUser('enabled-user', 'correct-password')

    expect(validated).toMatchObject({
      id: '42',
      sessionVersion: 3,
      status: UserStatus.ENABLED,
      username: 'enabled-user',
    })
    expect(validated).not.toHaveProperty('passwordHash')
    expect(validated).not.toHaveProperty('passwordAlgorithm')
  })

  it('returns a cached empty permission list without querying PostgreSQL', async () => {
    cacheService.getCache.mockResolvedValue({
      codes: [],
      schemaVersion: USER_PERMISSIONS_CACHE_SCHEMA_VERSION,
    })

    await expect(service.getEffectivePermissionsByUserId('42')).resolves.toEqual([])

    expect(cacheService.getCache).toHaveBeenCalledWith(authKeys.userPermissions('42'))
    expect(menuService.getPermissionsByUserId).not.toHaveBeenCalled()
    expect(cacheService.setCache).not.toHaveBeenCalled()
  })

  it('rebuilds a legacy unversioned permission cache during rollout', async () => {
    cacheService.getCache.mockResolvedValue([])
    menuService.getPermissionsByUserId.mockResolvedValue(['system:user:list'])

    await expect(
      service.getEffectivePermissionsByUserId('42'),
    ).resolves.toEqual(['system:user:list'])

    expect(menuService.getPermissionsByUserId).toHaveBeenCalledWith('42')
    expect(cacheService.setCache).toHaveBeenCalledWith(
      authKeys.userPermissions('42'),
      {
        codes: ['system:user:list'],
        schemaVersion: USER_PERMISSIONS_CACHE_SCHEMA_VERSION,
      },
    )
  })

  it('loads and caches effective permissions after a Redis miss', async () => {
    cacheService.getCache.mockResolvedValue(undefined)
    menuService.getPermissionsByUserId.mockResolvedValue(['system:user:list'])

    await expect(
      service.getEffectivePermissionsByUserId('42'),
    ).resolves.toEqual(['system:user:list'])

    expect(menuService.getPermissionsByUserId).toHaveBeenCalledWith('42')
    expect(cacheService.setCache).toHaveBeenCalledWith(
      authKeys.userPermissions('42'),
      {
        codes: ['system:user:list'],
        schemaVersion: USER_PERMISSIONS_CACHE_SCHEMA_VERSION,
      },
    )
  })

  it('invalidates the targeted user permission cache', async () => {
    await service.invalidatePermissionsCache('42')

    expect(cacheService.delCache).toHaveBeenCalledWith(authKeys.userPermissions('42'))
  })
})
