import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { DeptController } from './dept.controller.js'
import { DeptService } from './dept.service.js'
import { SysDeptEntity } from './entities/dept.entity.js'

@Module({
  imports: [TypeOrmModule.forFeature([SysDeptEntity, SysUserEntity])],
  controllers: [DeptController],
  providers: [DeptService],
  exports: [DeptService],
})
export class DeptModule {}
