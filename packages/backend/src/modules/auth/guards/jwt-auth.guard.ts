import type { FastifyRequest } from 'fastify'
import type { Socket } from 'socket.io'
import type { AppConfig } from '#/config/index.js'
import {
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { AuthGuard } from '@nestjs/passport'
import { ExtractJwt } from 'passport-jwt'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { APP_CONFIG, RouterWhiteList } from '#/config/index.js'
import { AuthService } from '#/modules/auth/auth.service.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { authKeys } from '#/shared/cache/keys/index.js'
import { AuthStrategy, PUBLIC_KEY } from '../auth.constant.js'
import { TokenService } from '../services/token.service.js'

@Injectable()
export class JwtAuthGuard extends AuthGuard(AuthStrategy.JWT) {
  private readonly httpTokenExtractor = ExtractJwt.fromAuthHeaderAsBearerToken()

  constructor(
    private reflector: Reflector,
    private readonly cacheService: CacheService,
    private authService: AuthService,
    private tokenService: TokenService,
    private jwtService: JwtService,
    @Inject(APP_CONFIG.KEY) private appConfig: AppConfig,
  ) {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const contextType = context.getType<'http' | 'ws'>()
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (contextType === 'ws') {
      const wsCheck = await this.activateWs(context, isPublic)

      try {
        const result = await (super.canActivate(context) as Promise<boolean>)
        return result
      }
      catch (error) {
        return true
      }
    }

    return this.activateHttp(context, isPublic)
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  private async activateHttp(context: ExecutionContext, isPublic: boolean): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()

    const token = this.httpTokenExtractor(request) || ''
    // 如果没有传递 token
    if (!token) {
      if (isPublic) {
        return true // 没传 token 且是 isPublic，直接放行
      }
      // 没传 token 且不是 isPublic，抛错
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }

    request.accessToken = token

    let result = false
    try {
      result = await super.canActivate(context) as boolean
    }
    catch (err) {
      if (isPublic) {
        return true // 传 token 但是过期 isPublic，直接放行
      }
      if (err instanceof UnauthorizedException)
        throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)

      if (!await this.tokenService.checkAccessToken(token))
        throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }

    const user = request.user as LoginUserContext
    await this.validateUserState(token, user.tokenInfo)

    return result
  }

  handleRequest(err: any, user: any) {
    if (err || !user)
      throw err || new UnauthorizedException()
    return user
  }

  // ── WebSocket ───────────────────────────────────────────────────────────────

  /**
   * WS 完全绕开 Passport 继承链（Passport Strategy 仅支持 HTTP context）
   * 直接用 JwtService.verifyAsync 解码，user 挂到 client.user
   * （Socket.IO 的 client.data 是框架提供的上下文存储，非业务数据）
   */
  private async activateWs(context: ExecutionContext, isPublic: boolean): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>()
    const token = this.extractWsToken(client)

    // 如果没有传递 token
    if (!token) {
      if (isPublic) {
        return true // 没传 token 且是 isPublic，直接放行
      }
      // 没传 token 且不是 isPublic，抛错
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }

    let loginUser: LoginUserContext
    try {
      loginUser = await this.tokenService.verifyAccessToken(token)
    }
    catch {
      if (isPublic) {
        return true // 传 token 但是过期 isPublic，直接放行
      }
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }

    await this.validateUserState(token, loginUser.tokenInfo)

    // Socket.IO client.data 是官方提供的 per-connection 元数据存储
    // handleConnection 已经挂在 client.user 了，不在重复
    // client.data.user = loginUser

    return true
  }

  private extractWsToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization
    if (authHeader?.startsWith('Bearer '))
      return authHeader.substring(7)

    return client.handshake.auth?.token ?? null
  }

  // ── 共享验证逻辑 ─────────────────────────────────────────────────────────────

  private async validateUserState(token: string, user: AuthUser): Promise<void> {
    if (await this.cacheService.getCache(authKeys.tokenBlacklist(user.jwtUuid)))
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)

    const pv = await this.authService.getPasswordVersionByUid(user.uid)
    if (pv !== user.pv)
      throw new BusinessException(ERROR_CODES.USER_PASSWORD_VERSION_ERROR)

    if (!this.appConfig.multiDeviceLogin) {
      const cacheToken = await this.authService.getTokenByUid(user.uid)
      if (token !== cacheToken)
        throw new BusinessException(ERROR_CODES.AUTH_LOGGED_IN_ELSEWHERE)
    }
  }
}
