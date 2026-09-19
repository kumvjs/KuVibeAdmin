import type { SecurityConfig } from '#/config/index.js'
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'

import { Repository } from 'typeorm'

import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { securityConfig } from '#/config/index.js'

import { UserStatus } from '#/modules/system/sys-user/sys-user.types.js'
import { UserService } from '#/modules/user/user.service.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { authKeys } from '#/shared/cache/keys/index.js'
import { onlineKeys } from '#/shared/cache/keys/online.keys.js'
import { generateUUID } from '#/utils/index.js'
import { dayjs } from '#/utils/time.util.js'
import { RefreshTokenEntity } from '../entities/refresh-token.entity.js'
import { JwtStrategy } from '../strategies/jwt.strategy.js'

/**
 * 令牌服务
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly cacheService: CacheService,
    private jwtService: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly userService: UserService,
    @Inject(securityConfig.KEY) private securityConfig: SecurityConfig,
    @InjectRepository(RefreshTokenEntity) private refreshTokenRepo: Repository<RefreshTokenEntity>,

  ) { }

  generateJwtSign(payload: any) {
    const jwtSign = this.jwtService.sign(payload)

    return jwtSign
  }

  async generateAccessToken(uid: string, sessionVersion: number) {
    const payload: AuthUser = {
      jwtUuid: generateUUID(),
      uid,
      pv: sessionVersion,
    }

    const jwtSign = await this.jwtService.signAsync(payload)

    // 存储用户的AccessToken
    await this.cacheService.setCache(
      authKeys.userTokens(uid, payload.jwtUuid),
      jwtSign,
      this.securityConfig.jwtExprire,
    )
    // 存储AccessToken的用户ID
    await this.cacheService.setCache(
      authKeys.accessToken(payload.jwtUuid),
      uid,
      this.securityConfig.jwtExprire,
    )
    return jwtSign
  }

  /**
   * 生成新的RefreshToken并存入数据库
   * @param payload
   * @param now
   */
  async generateRefreshToken(
    payload: AuthUser,
    now: dayjs.Dayjs,
  ): Promise<string> {
    payload.jwtUuid = generateUUID()
    const refreshTokenSign = await this.jwtService.signAsync(payload, {
      secret: this.securityConfig.refreshSecret,
      expiresIn: `${this.securityConfig.refreshExpire}s`,
    })

    await this.refreshTokenRepo.save({
      value: refreshTokenSign,
      expired_at: now
        .add(this.securityConfig.refreshExpire, 'second')
        .toDate(),
      user: { id: payload.uid },
    })
    // 存储RefreshToken的用户ID
    await this.cacheService.setCache(
      authKeys.userRefreshTokens(payload.uid, payload.jwtUuid),
      payload.uid,
      this.securityConfig.refreshExpire,
    )
    return refreshTokenSign
  }

  async refreshToken(oldRefreshToken: string) {
    let refreshUser: AuthUser
    try {
      refreshUser = await this.verifyRefreshToken(oldRefreshToken)
    }
    catch {
      throw new BusinessException(ERROR_CODES.AUTH_REFRESH_TOKEN_EXPIRED)
    }

    const cachedUserId = await this.cacheService.getCache(
      authKeys.userRefreshTokens(refreshUser.uid, refreshUser.jwtUuid),
    )
    if (String(cachedUserId) !== refreshUser.uid)
      throw new BusinessException(ERROR_CODES.AUTH_REFRESH_TOKEN_EXPIRED)

    const tokenRecord = await this.refreshTokenRepo.findOne({ where: { value: oldRefreshToken } })
    if (
      !tokenRecord
      || tokenRecord.userId !== refreshUser.uid
      || dayjs(tokenRecord.expired_at).isBefore(dayjs())
    ) {
      throw new BusinessException(ERROR_CODES.AUTH_REFRESH_TOKEN_EXPIRED)
    }

    const userId = tokenRecord.userId
    const user = await this.userService.getUserSessionState(userId)
    if (
      !user
      || user.status !== UserStatus.ENABLED
      || user.sessionVersion !== refreshUser.pv
    ) {
      throw new BusinessException(ERROR_CODES.AUTH_REFRESH_TOKEN_EXPIRED)
    }

    // PostgreSQL 的单条 DELETE 是并发刷新时的一次性消费点。只有删除成功的请求可以继续轮换。
    const consumed = await this.refreshTokenRepo.delete({ value: oldRefreshToken })
    if (consumed.affected !== 1)
      throw new BusinessException(ERROR_CODES.AUTH_REFRESH_TOKEN_EXPIRED)

    await this.cacheService.delCache(
      authKeys.userRefreshTokens(refreshUser.uid, refreshUser.jwtUuid),
    )

    const refreshTokenPayload: AuthUser = {
      jwtUuid: generateUUID(),
      uid: userId,
      pv: user.sessionVersion,
    }

    const newRefreshToken = await this.generateRefreshToken(refreshTokenPayload, dayjs())

    const accessToken = await this.generateAccessToken(userId, user.sessionVersion)

    return {
      accessToken,
      refreshToken: newRefreshToken,
    }
  }

  /**
   * 检查accessToken是否存在，并且是否处于有效期内
   * @param value
   */
  async checkAccessToken(value: string) {
    let isValid = false
    try {
      const loginUser = await this.verifyAccessToken(value)
      const res = await this.cacheService.getCache(authKeys.userTokens(loginUser.uid, loginUser.tokenInfo.jwtUuid))
      isValid = Boolean(res)
    }
    catch (error) { }

    return isValid
  }

  /**
   * 移除指定 JWT UUID 对应的 Access Token 状态
   * @param jwtUuid
   */
  async removeAccessTokenByJwtUuid(jwtUuid: string) {
    const userId = await this.cacheService.getCache(authKeys.accessToken(jwtUuid))
    await this.cacheService.delCache(authKeys.accessToken(jwtUuid))
    if (userId) {
      await this.cacheService.delCache(authKeys.userTokens(userId, jwtUuid))
      await this.cacheService.delCache(onlineKeys.user(userId))
    }
  }

  /**
   * 移除RefreshToken
   * @param value
   */
  async removeRefreshToken(value: string) {
    const user = await this.verifyRefreshToken(value)
    await this.refreshTokenRepo.delete({ value })
    await this.cacheService.delCache(authKeys.userRefreshTokens(user.uid, user.jwtUuid))
  }

  /**
   * 注销场景的幂等撤销。即使 Cookie 已损坏，也按原值清理可能存在的数据库记录。
   */
  async revokeRefreshToken(value: string): Promise<void> {
    let user: AuthUser | undefined
    try {
      user = await this.verifyRefreshToken(value)
    }
    catch { }

    await this.refreshTokenRepo.delete({ value })
    if (user) {
      await this.cacheService.delCache(
        authKeys.userRefreshTokens(user.uid, user.jwtUuid),
      )
    }
  }

  /**
   * 验证Token是否正确,如果正确则返回所属用户对象
   * @param token
   */
  async verifyAccessToken(token: string): Promise<LoginUserContext> { // 2. 手动触发你写在 Strategy 里的 validate 逻辑
    try {
      // 1. 解密并验证签名，拿到 payload
      const payload: AuthUser = await this.jwtService.verifyAsync(token)

      // 2. 手动触发你写在 Strategy 里的 validate 逻辑
      const user = await this.jwtStrategy.validate(payload)

      if (!user) {
        throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
      }

      return user // 此时返回的结构就和 HTTP 接口完全一样了
    }
    catch (error) {
      throw new BusinessException(ERROR_CODES.AUTH_TOKEN_INVALID)
    }
  }

  /**
   * 检查accessToken是否存在，并且是否处于有效期内
   * @param refreshToken
   */
  async checkRefreshToken(refreshToken: string) {
    let isValid = false
    try {
      const user = await this.verifyRefreshToken(refreshToken)
      const res = await this.cacheService.getCache(authKeys.userRefreshTokens(user.uid, user.jwtUuid))
      isValid = Boolean(res)
    }
    catch (error) { }

    return isValid
  }

  /**
   * 验证refreshToken是否正确,如果正确则返回所属用户对象
   * @param refreshToken
   */
  async verifyRefreshToken(refreshToken: string): Promise<AuthUser> {
    return this.jwtService.verifyAsync(refreshToken, {
      secret: this.securityConfig.refreshSecret,
    })
  }
}
