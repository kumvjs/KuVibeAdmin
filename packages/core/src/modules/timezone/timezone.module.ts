import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { TimezoneController } from './timezone.controller.js'
import { TimezoneService } from './timezone.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([SysUserEntity])],
  controllers: [TimezoneController],
  providers: [TimezoneService],
})
export class TimezoneModule {}
