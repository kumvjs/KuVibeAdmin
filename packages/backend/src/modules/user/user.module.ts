import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import SysUserRoleEntity from './entities/user-role.entity.js'
import { SysUserEntity } from './entities/user.entity.js'
import { UserRoleService } from './user-role/user-role.service.js'
import { UserController } from './user.controller.js'
import { UserService } from './user.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([SysUserEntity, SysUserRoleEntity])],
  controllers: [UserController],
  providers: [UserService, UserRoleService],
  exports: [UserService, UserRoleService],
})
export class UserModule {}
