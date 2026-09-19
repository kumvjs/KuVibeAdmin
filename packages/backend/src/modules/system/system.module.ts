import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { DeptModule } from './dept/dept.module.js'
import { LogModule } from './log/log.module.js'
import { RoleModule } from './role/role.module.js'
import { SysUserModule } from './sys-user/sys-user.module.js'

const modules = [
  DeptModule,
  RoleModule,
  LogModule,
  SysUserModule,
]

@Module({
  imports: [
    ...modules,
    RouterModule.register([
      {
        path: 'system',
        module: SystemModule,
        children: [...modules],
      },
    ]),
  ],
  exports: [...modules],
})
export class SystemModule {}
