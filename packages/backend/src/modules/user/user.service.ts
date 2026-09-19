import type { UserInfoResponseDto } from './dto/user-info-response.dto.js'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { userKeys } from '#/shared/cache/keys/index.js'
import { SysUserEntity } from './entities/user.entity.js'
import { UserRoleService } from './user-role/user-role.service.js'

@Injectable()
export class UserService {
  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
    private readonly userRoleService: UserRoleService,
  ) { }

  findUserByUserName(username: string) {
    return this.userRepository.findOne({
      where: {
        username,
      },
    })
  }

  /**
   * 登录专用方法：内部显式携带密码和盐
   */
  findUserForLogin(username: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username })
      .addSelect(['user.passwordAlgorithm', 'user.passwordHash'])
      .getOne()
  }

  async getUserById(id: string) {
    const u = await this.userRepository.findOne({
      where: {
        id,
      },
    })
    if (!u) {
      throw new BusinessException(ERROR_CODES.USER_NOT_FOUND)
    }
    return u
  }

  async info(id: string): Promise<UserInfoResponseDto> {
    const u = await this.getUserById(id)
    const roles = await this.userRoleService.getUserRoleCodes(id)
    return {
      avatar: u.avatar ?? '',
      desc: u.description ?? '',
      homePath: u.homePath ?? '',
      userId: u.id,
      username: u.username,
      realName: u.name,
      roles,
    }
  }

  async getUserSessionState(id: string): Promise<Pick<SysUserEntity, 'id' | 'sessionVersion' | 'status'> | null> {
    return this.userRepository.findOne({
      select: { id: true, sessionVersion: true, status: true },
      where: { id },
    })
  }

  getCachedUserById(id: string) {
    return this.cacheService.getOrSet<SysUserEntity>(
      userKeys.info(id),
      () => this.getUserById(id),
    )
  }
}
