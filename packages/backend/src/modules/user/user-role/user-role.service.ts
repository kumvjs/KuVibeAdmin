import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RoleStatus } from '#/modules/system/role/role.types.js'
import SysUserRoleEntity from '../entities/user-role.entity.js'

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(SysUserRoleEntity)
    private readonly userRoleRepo: Repository<SysUserRoleEntity>,
  ) {}

  async getRoleIdsByUser(userId: string): Promise<string[]> {
    const rows = await this.userRoleRepo.find({
      where: { userId },
      select: { roleId: true },
    })

    return rows.map(r => r.roleId)
  }

  async getUserRoleCodes(userId: string): Promise<string[]> {
    const userRoles = await this.userRoleRepo
      .createQueryBuilder('userRole')
    // 关键：innerJoinAndSelect 会自动把 role 实体挂载上去
      .innerJoinAndSelect('userRole.role', 'role')
    // 只选择中间表的 id 和 role 的 code，避免 select *
      .select(['userRole.id', 'role.code'])
      .where('userRole.userId = :userId', { userId })
      .andWhere('role.status = :status', { status: RoleStatus.ENABLED })
      .getMany()

    return userRoles.map(ur => ur.role?.code).filter(Boolean)
  }
}
