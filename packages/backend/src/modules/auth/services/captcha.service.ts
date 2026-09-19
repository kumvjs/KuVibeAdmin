import { Injectable } from '@nestjs/common'

import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { authKeys } from '#/shared/cache/keys/index.js'

@Injectable()
export class CaptchaService {
  constructor(
    private readonly cacheService: CacheService,
    // private captchaLogService: CaptchaLogService,
  ) { }

  /**
   * 校验图片验证码
   */
  async checkImgCaptcha(id: string, code: string): Promise<void> {
    const result = await this.cacheService.getCache(authKeys.captcha(id))
    if (!result || code.toLowerCase() !== result.toLowerCase())
      throw new BusinessException(ERROR_CODES.AUTH_CAPTCHA_CODE_ERROR)

    // 校验成功后移除验证码
    await this.cacheService.delCache(authKeys.captcha(id))
  }

  async log(
    account: string,
    code: string,
    provider: 'sms' | 'email',
    uid?: number,
  ): Promise<void> {
    /// await this.captchaLogService.create(account, code, provider, uid)
  }
}
