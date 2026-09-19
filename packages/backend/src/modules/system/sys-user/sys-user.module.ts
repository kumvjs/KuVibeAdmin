import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RefreshTokenEntity } from '#/modules/auth/entities/refresh-token.entity.js'
import { SysDeptEntity } from '#/modules/system/dept/entities/dept.entity.js'
import { SysRoleEntity } from '#/modules/system/role/entities/role.entity.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { SysUserController } from './sys-user.controller.js'
import { SysUserService } from './sys-user.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([
    RefreshTokenEntity,
    SysDeptEntity,
    SysRoleEntity,
    SysUserEntity,
    SysUserRoleEntity,
  ])],
  controllers: [SysUserController],
  providers: [SysUserService],
})
export class SysUserModule { }
