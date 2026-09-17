import type { EntityManager, Repository } from 'typeorm'
import type { CreateSysUserDto } from './dto/create-sys-user.dto.js'
import type { SysUserListResponseDto, SysUserResponseDto } from './dto/sys-user-response.dto.js'
import type { QuerySysUserListDto } from './dto/sys-user.dto.js'
import type { UpdateSysUserDto } from './dto/update-sys-user.dto.js'
import { ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Not } from 'typeorm'
import { Roles } from '#/modules/auth/auth.constant.js'
import { RefreshTokenEntity } from '#/modules/auth/entities/refresh-token.entity.js'
import { DeptStatus } from '#/modules/system/dept/dept.types.js'
import { SysDeptEntity } from '#/modules/system/dept/entities/dept.entity.js'
import { SysRoleEntity } from '#/modules/system/role/entities/role.entity.js'
import { RoleStatus } from '#/modules/system/role/role.types.js'
import { releaseUserAvatarReferences } from '#/modules/upload/attachment-reference.lifecycle.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { hashPassword } from '#/modules/user/password-hasher.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { authKeys } from '#/shared/cache/keys/auth.keys.js'
import { onlineKeys } from '#/shared/cache/keys/online.keys.js'
import { userKeys } from '#/shared/cache/keys/user.keys.js'
import { hasSubmittedField } from '#/utils/submitted-field.util.js'
import { assertPassword, assertSysUserId, buildSysUserWriteState, normalizeRoleIds } from './sys-user-write.rules.js'
import { PasswordAlgorithm, UserStatus } from './sys-user.types.js'

interface UserWriteEffects {
  revokeSessions: boolean
  sessionVersion?: number
  userId: string
}

@Injectable()
export class SysUserService {
  constructor(
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
    @InjectRepository(SysUserRoleEntity)
    private readonly userRoleRepository: Repository<SysUserRoleEntity>,
    private readonly cacheService: CacheService,
  ) {}

  async list(query: QuerySysUserListDto): Promise<SysUserListResponseDto> {
    this.assertDateRange(query.startTime, query.endTime)

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const builder = this.userRepository.createQueryBuilder('user')

    if (query.id) {
      assertSysUserId(query.id)
      builder.andWhere('user.id = :id', { id: query.id })
    }
    if (query.name) {
      const name = `%${this.escapeLike(query.name)}%`
      builder.andWhere('(user.name ILIKE :name OR user.username ILIKE :name)', { name })
    }
    if (query.remark)
      builder.andWhere('user.remark ILIKE :remark', { remark: `%${this.escapeLike(query.remark)}%` })
    if (query.status !== undefined)
      builder.andWhere('user.status = :status', { status: query.status })
    if (query.deptId) {
      assertSysUserId(query.deptId)
      builder.andWhere('user.deptId = :deptId', { deptId: query.deptId })
    }
    if (query.startTime)
      builder.andWhere('user.createdAt >= :startTime', { startTime: new Date(query.startTime) })
    if (query.endTime)
      builder.andWhere('user.createdAt <= :endTime', { endTime: new Date(query.endTime) })

    const [users, total] = await builder
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const rolesByUser = await this.getRoleIdsByUserIds(users.map(user => String(user.id)))
    return {
      items: users.map(user => this.toResponse(user, rolesByUser.get(String(user.id)) ?? [])),
      total,
    }
  }

  async create(dto: CreateSysUserDto): Promise<boolean> {
    assertPassword(dto.password)
    const passwordHash = await hashPassword(dto.password)

    await this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysUserEntity)
      const state = buildSysUserWriteState(dto)
      const roleIds = normalizeRoleIds(dto.roleIds)

      await this.assertUniqueUsername(repository, state.username)
      await this.validateDepartment(manager, state.deptId)
      await this.validateRoles(manager, roleIds)

      const user = await repository.save(repository.create({
        ...state,
        passwordAlgorithm: PasswordAlgorithm.ARGON2ID,
        passwordHash,
        sessionVersion: 1,
      }))
      await this.replaceRoles(manager, String(user.id), roleIds)
      return undefined
    })
    return true
  }

  async update(id: string, dto: UpdateSysUserDto): Promise<boolean> {
    assertSysUserId(id)
    const passwordHash = hasSubmittedField(dto, 'password')
      ? await this.preparePassword(dto.password)
      : undefined

    const effects = await this.runSerializableWrite(async (manager): Promise<UserWriteEffects> => {
      const repository = manager.getRepository(SysUserEntity)
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id },
      })
      if (!current)
        throw new NotFoundException('用户不存在')

      const state = buildSysUserWriteState(dto, current)
      const submittedRoleIds = hasSubmittedField(dto, 'roleIds')
        ? normalizeRoleIds(dto.roleIds)
        : undefined

      if (state.deptId !== current.deptId)
        await this.validateDepartment(manager, state.deptId)
      const submittedRoles = submittedRoleIds
        ? await this.validateRoles(manager, submittedRoleIds)
        : undefined

      const currentIsSuper = current.status === UserStatus.ENABLED
        && await this.hasEnabledSuperRole(manager, id)
      const remainsSuper = state.status === UserStatus.ENABLED
        && (submittedRoles
          ? submittedRoles.some(role => role.code === Roles.SUPER)
          : currentIsSuper)
      if (currentIsSuper && !remainsSuper)
        await this.assertAnotherEnabledSuper(manager, id)

      const revokeSessions = passwordHash !== undefined
        || (current.status === UserStatus.ENABLED && state.status === UserStatus.DISABLED)
      if (revokeSessions) {
        current.sessionVersion += 1
        await manager.getRepository(RefreshTokenEntity).delete({ userId: id })
      }
      if (passwordHash !== undefined) {
        current.passwordHash = passwordHash
        current.passwordAlgorithm = PasswordAlgorithm.ARGON2ID
      }

      if (state.avatar !== current.avatar)
        await releaseUserAvatarReferences(manager, id)
      Object.assign(current, state)
      await repository.save(current)
      if (submittedRoleIds)
        await this.replaceRoles(manager, id, submittedRoleIds)

      return {
        revokeSessions,
        sessionVersion: revokeSessions ? current.sessionVersion : undefined,
        userId: id,
      }
    })

    await this.applyCacheEffects(effects)
    return true
  }

  async remove(id: string): Promise<boolean> {
    assertSysUserId(id)

    const effects = await this.runSerializableWrite(async (manager): Promise<UserWriteEffects> => {
      const repository = manager.getRepository(SysUserEntity)
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id },
      })
      if (!current)
        throw new NotFoundException('用户不存在')

      if (
        current.status === UserStatus.ENABLED
        && await this.hasEnabledSuperRole(manager, id)
      ) {
        await this.assertAnotherEnabledSuper(manager, id)
      }

      await manager.getRepository(RefreshTokenEntity).delete({ userId: id })
      await manager.getRepository(SysUserRoleEntity).delete({ userId: id })
      await releaseUserAvatarReferences(manager, id)
      const result = await repository.softDelete({ id })
      if (result.affected !== 1)
        throw new ConflictException('用户删除失败，请刷新后重试')

      return { revokeSessions: true, userId: id }
    })

    await this.applyCacheEffects(effects)
    return true
  }

  private async getRoleIdsByUserIds(userIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (!userIds.length)
      return result

    const mappings = await this.userRoleRepository.find({
      select: { roleId: true, userId: true },
      where: { userId: In(userIds) },
    })
    for (const mapping of mappings) {
      const userId = String(mapping.userId)
      const roleIds = result.get(userId) ?? []
      roleIds.push(String(mapping.roleId))
      result.set(userId, roleIds)
    }
    for (const roleIds of result.values())
      roleIds.sort(this.compareBigintStrings)
    return result
  }

  private toResponse(user: SysUserEntity, roleIds: string[]): SysUserResponseDto {
    const response: SysUserResponseDto = {
      createTime: user.createdAt,
      deptId: user.deptId ? String(user.deptId) : null,
      id: String(user.id),
      name: user.name,
      roleIds,
      status: user.status,
      username: user.username,
    }
    if (user.remark)
      response.remark = user.remark
    return response
  }

  private async assertUniqueUsername(
    repository: Repository<SysUserEntity>,
    username: string,
    editingId?: string,
  ): Promise<void> {
    if (await repository.existsBy(editingId ? { id: Not(editingId), username } : { username }))
      throw new ConflictException('登录账号已存在')
  }

  private async validateDepartment(manager: EntityManager, deptId: string): Promise<void> {
    const department = await manager.getRepository(SysDeptEntity).findOne({
      lock: { mode: 'pessimistic_read' },
      select: { id: true, status: true },
      where: { id: deptId },
    })
    if (!department)
      throw new UnprocessableEntityException('所属部门不存在')
    if (department.status !== DeptStatus.ENABLED)
      throw new UnprocessableEntityException('不能分配到已停用的部门')
  }

  private async validateRoles(manager: EntityManager, roleIds: string[]): Promise<SysRoleEntity[]> {
    const roles = await manager.getRepository(SysRoleEntity)
      .createQueryBuilder('role')
      .where('role.id IN (:...roleIds)', { roleIds })
      .andWhere('role.status = :status', { status: RoleStatus.ENABLED })
      .setLock('pessimistic_read')
      .getMany()
    const foundIds = new Set(roles.map(role => String(role.id)))
    const missingIds = roleIds.filter(roleId => !foundIds.has(roleId))
    if (missingIds.length)
      throw new UnprocessableEntityException(`角色不存在或已停用：${missingIds.join(',')}`)
    return roles
  }

  private async replaceRoles(manager: EntityManager, userId: string, roleIds: string[]): Promise<void> {
    const repository = manager.getRepository(SysUserRoleEntity)
    await repository.delete({ userId })
    await repository.insert(roleIds.map(roleId => ({ roleId, userId })))
  }

  private async hasEnabledSuperRole(manager: EntityManager, userId: string): Promise<boolean> {
    return manager.getRepository(SysUserRoleEntity)
      .createQueryBuilder('userRole')
      .innerJoin('userRole.role', 'role')
      .where('userRole.userId = :userId', { userId })
      .andWhere('role.code = :code', { code: Roles.SUPER })
      .andWhere('role.status = :status', { status: RoleStatus.ENABLED })
      .getExists()
  }

  private async assertAnotherEnabledSuper(manager: EntityManager, excludingUserId: string): Promise<void> {
    const anotherSuper = await manager.getRepository(SysUserEntity)
      .createQueryBuilder('user')
      .select('user.id')
      .innerJoin('user.userRoles', 'userRole')
      .innerJoin('userRole.role', 'role')
      .where('user.id != :excludingUserId', { excludingUserId })
      .andWhere('user.status = :userStatus', { userStatus: UserStatus.ENABLED })
      .andWhere('role.code = :code', { code: Roles.SUPER })
      .andWhere('role.status = :roleStatus', { roleStatus: RoleStatus.ENABLED })
      .setLock('pessimistic_read')
      .getOne()
    if (!anotherSuper)
      throw new ConflictException('不能停用、删除或移除最后一个启用的超级管理员')
  }

  private async applyCacheEffects(effects: UserWriteEffects): Promise<void> {
    if (effects.sessionVersion !== undefined) {
      await this.cacheService.setCache(
        authKeys.passwordVersion(effects.userId),
        effects.sessionVersion,
      )
    }
    else if (effects.revokeSessions) {
      await this.cacheService.delCache(authKeys.passwordVersion(effects.userId))
    }

    const deletes = [
      this.cacheService.delCache(userKeys.info(effects.userId)),
      this.cacheService.delCache(authKeys.userPermissions(effects.userId)),
    ]
    if (effects.revokeSessions) {
      deletes.push(
        this.cacheService.delCacheByPrefix(authKeys.userTokensPrefix(effects.userId)),
        this.cacheService.delCacheByPrefix(authKeys.userRefreshTokensPrefix(effects.userId)),
        this.cacheService.delCache(onlineKeys.user(effects.userId)),
      )
    }
    await Promise.all(deletes)
  }

  private async preparePassword(value: unknown): Promise<string> {
    assertPassword(value)
    return hashPassword(value)
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

  private compareBigintStrings(left: string, right: string): number {
    const leftId = BigInt(left)
    const rightId = BigInt(right)
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
  }

  private async runSerializableWrite<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.userRepository.manager.transaction('SERIALIZABLE', operation)
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error

      const driverError = error as { code?: string, constraint?: string, driverError?: { code?: string, constraint?: string } }
      const code = driverError.code ?? driverError.driverError?.code
      const constraint = driverError.constraint ?? driverError.driverError?.constraint ?? ''
      if (code === '23505') {
        const field = constraint.includes('username') ? '登录账号' : '用户角色关系'
        throw new ConflictException(`${field}已存在`)
      }
      if (code === '23503')
        throw new ConflictException('用户的部门或角色关系已发生变化，请刷新后重试')
      if (code === '40001' || code === '40P01')
        throw new ConflictException('用户已被并发修改，请刷新后重试')

      throw error
    }
  }
}
