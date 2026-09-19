import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'

import { Repository } from 'typeorm'

import { getIpAddress } from '#/utils/index.js'
import { LoginLogEntity } from '../entities/login-log.entity.js'

@Injectable()
export class LoginLogService {
  constructor(
    @InjectRepository(LoginLogEntity)
    private loginLogRepository: Repository<LoginLogEntity>,

  ) { }

  async create(uid: string, ip: string, ua: string): Promise<void> {
    try {
      const address = await getIpAddress(ip)

      await this.loginLogRepository.save({
        ip,
        ua,
        address,
        user: { id: uid },
      })
    }
    catch (e) {
      Logger.error(e)
    }
  }
}
