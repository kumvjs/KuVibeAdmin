import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserModule } from '#/modules/user/user.module.js'
import { RoleModule } from '../role/role.module.js'
import { SysMenuEntity } from './entities/menu.entity.js'
import { MenuController } from './menu.controller.js'
import { MenuService } from './menu.service.js'
import { SystemMenuController } from './system-menu.controller.js'

@Module({
  imports: [TypeOrmModule.forFeature([SysMenuEntity]), forwardRef(() => RoleModule), forwardRef(() => UserModule)],
  controllers: [MenuController, SystemMenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule { }
