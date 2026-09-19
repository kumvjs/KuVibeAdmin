import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CaptchaLogEntity } from './entities/captcha-log.entity.js'
import { LoginLogEntity } from './entities/login-log.entity.js'
import { LoginLogService } from './services/login-log.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([LoginLogEntity, CaptchaLogEntity])],
  controllers: [],
  providers: [LoginLogService],
  exports: [LoginLogService],
})
export class LogModule {}
