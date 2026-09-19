import type { SecurityConfig } from '#/config/index.js'
import { Inject, Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'

import { ExtractJwt, Strategy } from 'passport-jwt'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'

import { BusinessException } from '#/common/exceptions/business.exception.js'
import { securityConfig } from '#/config/index.js'
import { UserStatus } from '#/modules/system/sys-user/sys-user.types.js'
import { UserRoleService } from '#/modules/user/user-role/user-role.service.js'
import { UserService } from '#/modules/user/user.service.js'
import { TraceContext } from '#/shared/logger/logger.service.js'
import { AuthStrategy } from '../auth.constant.js'

/**
 * JWT Strategy - 同时支持 HTTP 和 WebSocket
 *
 * Token 提取优先级：
 * 1. HTTP: Authorization Bearer token
 * 2. WebSocket: handshake.auth.token
 * 3. Cookie: access_token
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, AuthStrategy.JWT) {
  constructor(
    @Inject(securityConfig.KEY) private securityConfig: SecurityConfig,
    private readonly userService: UserService,
    private readonly userRoleService: UserRoleService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        req => req.handshake?.auth?.token, // ws
        req => req.cookies?.access_token, // cookie
        ExtractJwt.fromAuthHeaderAsBearerToken(), // http
      ]),
      ignoreExpiration: false,
      secretOrKey: securityConfig.jwtSecret,
    })
  }

  async validate(payload: AuthUser) {
    const { uid } = payload
    if (!uid) {
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }
    const user = await this.userService.getCachedUserById(uid)
    if (!user || user.status !== UserStatus.ENABLED) {
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }
    const traceStore = TraceContext.storage.getStore()

    if (traceStore) {
      traceStore.userId = user.id
    }
    const roleCodes = await this.userRoleService.getUserRoleCodes(uid)
    const loginUser: LoginUserContext = {
      uid,
      user,
      roleCodes,
      tokenInfo: payload,
    }
    return loginUser
  }
}
