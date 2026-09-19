import type { EntityManager } from 'typeorm'
import type { CreateRoleDto } from './dto/create-role.dto.js'
import type { RoleListQueryDto } from './dto/role-list-query.dto.js'
import type { RoleListResponseDto, RoleResponseDto } from './dto/role-response.dto.js'
import type { UpdateRoleDto } from './dto/update-role.dto.js'
import { randomUUID } from 'node:crypto'
import { ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Not, Repository } from 'typeorm'
import { Roles } from '#/modules/auth/auth.constant.js'
import { SysMenuEntity } from '#/modules/system/menu/entities/menu.entity.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { authKeys } from '#/shared/cache/keys/auth.keys.js'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'
import SysRoleMenuEntity from './entities/role-menu.entity.js'
import { SysRoleEntity } from './entities/role.entity.js'
import { assertPublicRoleCode, assertRoleId, buildRoleWriteState, normalizePermissionIds } from './role-write.rules.js'
import { RoleStatus } from './role.types.js'

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(SysRoleEntity)
    private readonly roleRepository: Repository<SysRoleEntity>,
    @InjectRepository(SysRoleMenuEntity)
    private readonly roleMenuRepository: Repository<SysRoleMenuEntity>,
    private readonly cacheService: CacheService,
  ) {}

  async getRoleCodes(ids: string[]): Promise<string[]> {
    const roles
      = await this.roleRepository.find({
        select: { code: true },
        where: {
          id: In(ids),
        },
      })
    return roles.map(r => r.code)
  }

  async list(query: RoleListQueryDto): Promise<RoleListResponseDto> {
    this.assertDateRange(query.startTime, query.endTime)

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const builder = this.roleRepository.createQueryBuilder('role')

    if (query.id) {
      assertRoleId(query.id)
      builder.andWhere('role.id = :id', { id: query.id })
    }
    if (query.name)
      builder.andWhere('role.name ILIKE :name', { name: `%${this.escapeLike(query.name)}%` })
    if (query.remark)
      builder.andWhere('role.remark ILIKE :remark', { remark: `%${this.escapeLike(query.remark)}%` })
    if (query.status !== undefined)
      builder.andWhere('role.status = :status', { status: query.status })
    if (query.startTime)
      builder.andWhere('role.createdAt >= :startTime', { startTime: new Date(query.startTime) })
    if (query.endTime)
      builder.andWhere('role.createdAt <= :endTime', { endTime: new Date(query.endTime) })

    const [roles, total] = await builder
      .orderBy('role.createdAt', 'DESC')
      .addOrderBy('role.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const permissionsByRole = await this.getPermissionsByRoleIds(roles.map(role => String(role.id)))
    return {
      items: roles.map(role => this.toResponse(role, permissionsByRole.get(String(role.id)) ?? [])),
      total,
    }
  }

  async create(dto: CreateRoleDto): Promise<boolean> {
    const code = dto.code ?? `role:${randomUUID()}`
    assertPublicRoleCode(code)

    await this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysRoleEntity)
      const state = buildRoleWriteState(dto, undefined, code)
      const permissionIds = normalizePermissionIds(dto.permissions)

      await this.assertUniqueRole(repository, state.name, state.code)
      await this.validateMenuIds(manager, permissionIds)
      const role = await repository.save(repository.create({
        ...state,
        isDefault: false,
      }))
      await this.replacePermissions(manager, String(role.id), permissionIds)
      return [] as string[]
    })
    return true
  }

  async update(id: string, dto: UpdateRoleDto): Promise<boolean> {
    assertRoleId(id)

    const affectedUserIds = await this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysRoleEntity)
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id },
      })
      if (!current)
        throw new NotFoundException('角色不存在')

      const state = buildRoleWriteState(dto, current)
      if (this.isProtected(current) && state.status !== RoleStatus.ENABLED)
        throw new ConflictException('系统超级角色或默认角色不能停用')

      await this.assertUniqueRole(repository, state.name, undefined, id)
      if (hasSubmittedField(dto, 'permissions')) {
        const permissionIds = normalizePermissionIds(dto.permissions)
        await this.validateMenuIds(manager, permissionIds)
        await this.replacePermissions(manager, id, permissionIds)
      }

      Object.assign(current, state)
      await repository.save(current)
      return this.getAffectedUserIds(manager, id)
    })
    await this.invalidatePermissionsCaches(affectedUserIds)
    return true
  }

  async remove(id: string): Promise<boolean> {
    assertRoleId(id)

    await this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysRoleEntity)
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id },
      })
      if (!current)
        throw new NotFoundException('角色不存在')
      if (this.isProtected(current))
        throw new ConflictException('系统超级角色或默认角色不能删除')

      const assigned = await manager
        .getRepository(SysUserRoleEntity)
        .createQueryBuilder('userRole')
        .withDeleted()
        .where('userRole.roleId = :id', { id })
        .getExists()
      if (assigned)
        throw new ConflictException('角色仍被用户引用，不能删除')

      await manager.getRepository(SysRoleMenuEntity).delete({ roleId: id })
      const result = await repository.softDelete({ id })
      if (result.affected !== 1)
        throw new ConflictException('角色删除失败，请刷新后重试')
      return [] as string[]
    })
    return true
  }

  private async getPermissionsByRoleIds(roleIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (!roleIds.length)
      return result

    const mappings = await this.roleMenuRepository.find({
      select: { menuId: true, roleId: true },
      where: { roleId: In(roleIds) },
    })
    for (const mapping of mappings) {
      const roleId = String(mapping.roleId)
      const permissions = result.get(roleId) ?? []
      permissions.push(String(mapping.menuId))
      result.set(roleId, permissions)
    }
    for (const permissions of result.values())
      permissions.sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0)
    return result
  }

  private toResponse(role: SysRoleEntity, permissions: string[]): RoleResponseDto {
    const response: RoleResponseDto = {
      code: role.code,
      createTime: role.createdAt,
      id: String(role.id),
      isDefault: role.isDefault,
      name: role.name,
      permissions,
      status: role.status,
    }
    if (role.remark)
      response.remark = role.remark
    return response
  }

  private async assertUniqueRole(
    repository: Repository<SysRoleEntity>,
    name: string,
    code?: string,
    editingId?: string,
  ): Promise<void> {
    if (await repository.existsBy(editingId ? { id: Not(editingId), name } : { name }))
      throw new ConflictException('角色名称已存在')
    if (code && await repository.exists({ where: { code }, withDeleted: true }))
      throw new ConflictException('角色标识已存在')
  }

  private async validateMenuIds(manager: EntityManager, ids: string[]): Promise<void> {
    if (!ids.length)
      return

    const menus = await manager
      .getRepository(SysMenuEntity)
      .createQueryBuilder('menu')
      .select('menu.id')
      .where('menu.id IN (:...ids)', { ids })
      .setLock('pessimistic_read')
      .getMany()
    const foundIds = new Set(menus.map(menu => String(menu.id)))
    const missingIds = ids.filter(id => !foundIds.has(id))
    if (missingIds.length)
      throw new UnprocessableEntityException(`权限菜单不存在：${missingIds.join(',')}`)
  }

  private async replacePermissions(manager: EntityManager, roleId: string, menuIds: string[]): Promise<void> {
    const repository = manager.getRepository(SysRoleMenuEntity)
    await repository.delete({ roleId })
    if (menuIds.length) {
      await repository.insert(menuIds.map(menuId => ({ menuId, roleId })))
    }
  }

  private async getAffectedUserIds(manager: EntityManager, roleId: string): Promise<string[]> {
    const mappings = await manager.getRepository(SysUserRoleEntity).find({
      select: { userId: true },
      where: { roleId },
    })
    return [...new Set(mappings.map(mapping => String(mapping.userId)))].sort()
  }

  private async invalidatePermissionsCaches(userIds: string[]): Promise<void> {
    const batchSize = 100
    for (let offset = 0; offset < userIds.length; offset += batchSize) {
      await Promise.all(userIds.slice(offset, offset + batchSize).map(
        userId => this.cacheService.delCache(authKeys.userPermissions(userId)),
      ))
    }
  }

  private isProtected(role: Pick<SysRoleEntity, 'code' | 'isDefault'>): boolean {
    return role.code === Roles.SUPER || role.isDefault
  }

  private assertDateRange(startTime?: string, endTime?: string): void {
    const start = startTime ? Date.parse(startTime) : undefined
    const end = endTime ? Date.parse(endTime) : undefined
    if ((startTime && Number.isNaN(start)) || (endTime && Number.isNaN(end)))
      throw new UnprocessableEntityException('时间筛选必须是有效的 ISO 8601 时间')
    if (start !== undefined && end !== undefined && start > end)
      throw new UnprocessableEntityException('startTime 不能晚于 endTime')
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&')
  }

  private async runSerializableWrite<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.roleRepository.manager.transaction('SERIALIZABLE', operation)
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error

      const driverError = error as { code?: string, constraint?: string, driverError?: { code?: string, constraint?: string } }
      const code = driverError.code ?? driverError.driverError?.code
      const constraint = driverError.constraint ?? driverError.driverError?.constraint ?? ''
      if (code === '23505') {
        const field = constraint.includes('code') ? '角色标识' : '角色名称'
        throw new ConflictException(`${field}已存在`)
      }
      if (code === '23503')
        throw new ConflictException('角色授权关系已发生变化，请刷新后重试')
      if (code === '40001' || code === '40P01')
        throw new ConflictException('角色已被并发修改，请刷新后重试')

      throw error
    }
  }
}
