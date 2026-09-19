import type { FastifyRequest } from 'fastify'
import type { Socket } from 'socket.io'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { isProd } from '#/config/index.js'
import { PERMISSION_KEY, PUBLIC_KEY, Roles } from '../auth.constant.js'
import { AuthService } from '../auth.service.js'

/**
 * RBAC Guard - 同时支持 HTTP 和 WebSocket
 *
 * 核心逻辑：
 * 1. 检查 @Public() 装饰器
 * 2. 获取用户信息（req.user 或 client.user）
 * 3. 检查 @RequirePermissions() 装饰器
 * 4. 验证用户权限
 *
 * 差异点：只有获取 user 的位置不同
 */
@Injectable()
export class RbacGuard implements CanActivate {
  private logger = new Logger(RbacGuard.name)
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<any> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic)
      return true

    // 统一获取 user
    const loginUser = this.getLoginUser(context)

    if (!loginUser)
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)

    const payloadPermission = this.reflector.getAllAndOverride<
      string | string[]
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()])

    if (!payloadPermission)
      return true

    if (loginUser.roleCodes.includes(Roles.SUPER))
      return true

    // 核心逻辑：检查权限（HTTP 和 WS 完全一样）
    const allPermissions = await this.authService.getEffectivePermissionsByUserId(loginUser.uid)

    let canNext = false

    if (Array.isArray(payloadPermission))
      canNext = payloadPermission.every(i => allPermissions.includes(i))

    if (typeof payloadPermission === 'string')
      canNext = allPermissions.includes(payloadPermission)

    if (!canNext)
      throw new BusinessException(ERROR_CODES.AUTH_UNAUTHORIZED)

    return true
  }

  /**
   * 获取 user - 统一 HTTP 和 WS
   */
  private getLoginUser(context: ExecutionContext): LoginUserContext | undefined {
    const contextType = context.getType() as string

    if (contextType === 'http') {
      const request = context.switchToHttp().getRequest<FastifyRequest>()
      return request.user as LoginUserContext
    }

    if (contextType === 'ws') {
      const client = context.switchToWs().getClient<Socket>()

      if (!isProd)
        this.logger.log(`🚀 RbacGuard canActivate ws getUser: ${JSON.stringify(client.user)}`)
      return client.user as LoginUserContext
    }

    return undefined
  }
}
