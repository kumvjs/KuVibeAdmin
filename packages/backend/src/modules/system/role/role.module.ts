import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import SysUserRoleEntity from '../../user/entities/user-role.entity.js'
import { SysMenuEntity } from '../menu/entities/menu.entity.js'
import SysRoleMenuEntity from './entities/role-menu.entity.js'
import { SysRoleEntity } from './entities/role.entity.js'
import { RoleController } from './role.controller.js'
import { RoleService } from './role.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([
    SysMenuEntity,
    SysRoleEntity,
    SysRoleMenuEntity,
    SysUserRoleEntity,
  ])],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
