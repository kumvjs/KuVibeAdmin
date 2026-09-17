import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { UserStatus } from '#/modules/system/sys-user/sys-user.types.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { userKeys } from '#/shared/cache/keys/index.js'
import { getTimezoneIds, isIanaTimezone } from '#/utils/time.util.js'
import { TimezoneOptionDto } from './dto/timezone.dto.js'

@Injectable()
export class TimezoneService {
  constructor(
    @InjectRepository(SysUserEntity) private readonly users: Repository<SysUserEntity>,
    private readonly cache: CacheService,
  ) {}

  getOptions(): TimezoneOptionDto[] {
    return getTimezoneIds().map(value => ({ label: value, value }))
  }

  async getTimezone(userId: string): Promise<string | null> {
    const user = await this.users.findOne({
      select: { id: true, timezone: true },
      where: { id: userId, status: UserStatus.ENABLED },
    })
    if (!user)
      throw new BusinessException(ERROR_CODES.USER_NOT_FOUND)
    return user.timezone ?? null
  }

  async setTimezone(userId: string, timezone: string | null): Promise<boolean> {
    if (timezone !== null && !isIanaTimezone(timezone))
      throw new UnprocessableEntityException('timezone 必须是 IANA 时区或 null')
    const result = await this.users.update(
      { id: userId, deletedAt: IsNull(), status: UserStatus.ENABLED },
      { timezone, updatedBy: userId },
    )
    if (!result.affected)
      throw new BusinessException(ERROR_CODES.USER_NOT_FOUND)
    await this.cache.delCache(userKeys.info(userId))
    return true
  }
}
