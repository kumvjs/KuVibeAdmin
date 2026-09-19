import type { Repository } from 'typeorm'
import type { CacheService } from '#/shared/cache/cache.service.js'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { RefreshTokenEntity } from '#/modules/auth/entities/refresh-token.entity.js'
import { DeptStatus } from '#/modules/system/dept/dept.types.js'
import { SysDeptEntity } from '#/modules/system/dept/entities/dept.entity.js'
import { SysRoleEntity } from '#/modules/system/role/entities/role.entity.js'
import { RoleStatus } from '#/modules/system/role/role.types.js'
import { AttachmentReferenceEntity } from '#/modules/upload/entities/attachment-reference.entity.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { authKeys } from '#/shared/cache/keys/auth.keys.js'
import { onlineKeys } from '#/shared/cache/keys/online.keys.js'
import { userKeys } from '#/shared/cache/keys/user.keys.js'
import { SysUserService } from './sys-user.service.js'
import { PasswordAlgorithm, UserStatus } from './sys-user.types.js'

function user(overrides: Partial<SysUserEntity> = {}): SysUserEntity {
  return {
    avatar: null,
    deptId: '3',
    description: null,
    homePath: null,
    id: '42',
    name: '财务用户',
    remark: null,
    sessionVersion: 1,
    status: UserStatus.ENABLED,
    timezone: null,
    username: 'finance.user',
    ...overrides,
  } as SysUserEntity
}

describe('vben system-user writes', () => {
  const transactionalUserRepository = {
    create: jest.fn((value: unknown) => value),
    createQueryBuilder: jest.fn(),
    existsBy: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  }
  const transactionalUserRoleRepository = {
    createQueryBuilder: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
  }
  const departmentRepository = { findOne: jest.fn() }
  const refreshTokenRepository = { delete: jest.fn() }
  const roleQueryBuilder = {
    andWhere: jest.fn(),
    getMany: jest.fn(),
    setLock: jest.fn(),
    where: jest.fn(),
  }
  const roleRepository = { createQueryBuilder: jest.fn() }
  const assignedSuperQueryBuilder = {
    andWhere: jest.fn(),
    getExists: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
  }
  const anotherSuperQueryBuilder = {
    andWhere: jest.fn(),
    getOne: jest.fn(),
    innerJoin: jest.fn(),
    select: jest.fn(),
    setLock: jest.fn(),
    where: jest.fn(),
  }
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === AttachmentReferenceEntity)
        return { findBy: jest.fn().mockResolvedValue([]) }
      if (entity === SysUserEntity)
        return transactionalUserRepository
      if (entity === SysUserRoleEntity)
        return transactionalUserRoleRepository
      if (entity === SysDeptEntity)
        return departmentRepository
      if (entity === SysRoleEntity)
        return roleRepository
      if (entity === RefreshTokenEntity)
        return refreshTokenRepository
      throw new Error('Unexpected repository')
    }),
  }
  const userRepository = {
    manager: {
      transaction: jest.fn(async (_isolation: string, operation: (value: typeof manager) => unknown) => operation(manager)),
    },
  }
  const cacheService = {
    delCache: jest.fn(),
    delCacheByPrefix: jest.fn(),
    setCache: jest.fn(),
  }
  const service = new SysUserService(
    userRepository as unknown as Repository<SysUserEntity>,
    {} as Repository<SysUserRoleEntity>,
    cacheService as unknown as CacheService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    transactionalUserRepository.existsBy.mockResolvedValue(false)
    transactionalUserRepository.findOne.mockResolvedValue(null)
    transactionalUserRepository.save.mockImplementation(async value => ({ id: '42', ...(value as object) }))
    transactionalUserRepository.softDelete.mockResolvedValue({ affected: 1 })
    transactionalUserRoleRepository.delete.mockResolvedValue({ affected: 0 })
    transactionalUserRoleRepository.insert.mockResolvedValue({ identifiers: [] })
    departmentRepository.findOne.mockResolvedValue({ id: '3', status: DeptStatus.ENABLED })
    refreshTokenRepository.delete.mockResolvedValue({ affected: 0 })
    for (const method of ['andWhere', 'setLock', 'where'] as const)
      roleQueryBuilder[method].mockReturnValue(roleQueryBuilder)
    roleQueryBuilder.getMany.mockResolvedValue([
      { code: 'finance-manager', id: '2', status: RoleStatus.ENABLED },
      { code: 'auditor', id: '10', status: RoleStatus.ENABLED },
    ])
    roleRepository.createQueryBuilder.mockReturnValue(roleQueryBuilder)
    for (const method of ['andWhere', 'innerJoin', 'where'] as const)
      assignedSuperQueryBuilder[method].mockReturnValue(assignedSuperQueryBuilder)
    assignedSuperQueryBuilder.getExists.mockResolvedValue(false)
    transactionalUserRoleRepository.createQueryBuilder.mockReturnValue(assignedSuperQueryBuilder)
    for (const method of ['andWhere', 'innerJoin', 'select', 'setLock', 'where'] as const)
      anotherSuperQueryBuilder[method].mockReturnValue(anotherSuperQueryBuilder)
    anotherSuperQueryBuilder.getOne.mockResolvedValue({ id: '7' })
    transactionalUserRepository.createQueryBuilder.mockReturnValue(anotherSuperQueryBuilder)
    cacheService.delCache.mockResolvedValue(undefined)
    cacheService.delCacheByPrefix.mockResolvedValue(undefined)
    cacheService.setCache.mockResolvedValue(undefined)
  })

  it('creates an Argon2id user and atomically assigns validated roles', async () => {
    await expect(service.create({
      deptId: '3',
      name: '财务用户',
      password: 'correct horse battery staple',
      roleIds: ['10', '2'],
      status: UserStatus.ENABLED,
      username: 'finance.user',
    })).resolves.toBe(true)

    expect(userRepository.manager.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function))
    expect(departmentRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      lock: { mode: 'pessimistic_read' },
      where: { id: '3' },
    }))
    expect(roleQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_read')
    expect(transactionalUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      passwordAlgorithm: PasswordAlgorithm.ARGON2ID,
      passwordHash: expect.stringMatching(/^\$argon2id\$/),
      username: 'finance.user',
    }))
    expect(transactionalUserRoleRepository.insert).toHaveBeenCalledWith([
      { roleId: '2', userId: '42' },
      { roleId: '10', userId: '42' },
    ])
  })

  it('rejects duplicate usernames, disabled departments, and missing roles', async () => {
    transactionalUserRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.create({
      deptId: '3',
      name: '用户',
      password: 'correct horse battery staple',
      roleIds: ['2'],
      status: UserStatus.ENABLED,
      username: 'existing.user',
    })).rejects.toThrow('登录账号已存在')

    transactionalUserRepository.existsBy.mockResolvedValueOnce(false)
    departmentRepository.findOne.mockResolvedValueOnce({ id: '3', status: DeptStatus.DISABLED })
    await expect(service.create({
      deptId: '3',
      name: '用户',
      password: 'correct horse battery staple',
      roleIds: ['2'],
      status: UserStatus.ENABLED,
      username: 'new.user',
    })).rejects.toThrow('已停用的部门')

    roleQueryBuilder.getMany.mockResolvedValueOnce([])
    await expect(service.create({
      deptId: '3',
      name: '用户',
      password: 'correct horse battery staple',
      roleIds: ['99'],
      status: UserStatus.ENABLED,
      username: 'new.user',
    })).rejects.toThrow('角色不存在或已停用：99')
  })

  it('preserves immutable credentials and roles for a Vben status-neutral partial update', async () => {
    const current = user()
    transactionalUserRepository.findOne.mockResolvedValueOnce(current)

    await expect(service.update('42', { name: '新展示名' })).resolves.toBe(true)

    expect(current.username).toBe('finance.user')
    expect(current.name).toBe('新展示名')
    expect(transactionalUserRoleRepository.delete).not.toHaveBeenCalled()
    expect(refreshTokenRepository.delete).not.toHaveBeenCalled()
    expect(cacheService.delCache).toHaveBeenCalledWith(userKeys.info('42'))
    expect(cacheService.delCache).toHaveBeenCalledWith(authKeys.userPermissions('42'))
  })

  it('replaces roles and invalidates only the targeted authorization cache', async () => {
    transactionalUserRepository.findOne.mockResolvedValueOnce(user())

    await expect(service.update('42', { roleIds: ['10', '2'] })).resolves.toBe(true)

    expect(transactionalUserRoleRepository.delete).toHaveBeenCalledWith({ userId: '42' })
    expect(transactionalUserRoleRepository.insert).toHaveBeenCalledWith([
      { roleId: '2', userId: '42' },
      { roleId: '10', userId: '42' },
    ])
    expect(cacheService.delCacheByPrefix).not.toHaveBeenCalled()
  })

  it('resets passwords with Argon2id, increments the session version, and revokes sessions', async () => {
    const current = user()
    transactionalUserRepository.findOne.mockResolvedValueOnce(current)

    await expect(service.update('42', {
      password: 'a completely new secure password',
    })).resolves.toBe(true)

    expect(current.passwordHash).toMatch(/^\$argon2id\$/)
    expect(current.passwordAlgorithm).toBe(PasswordAlgorithm.ARGON2ID)
    expect(current.sessionVersion).toBe(2)
    expect(refreshTokenRepository.delete).toHaveBeenCalledWith({ userId: '42' })
    expect(cacheService.delCacheByPrefix).toHaveBeenCalledWith(authKeys.userTokensPrefix('42'))
    expect(cacheService.delCacheByPrefix).toHaveBeenCalledWith(authKeys.userRefreshTokensPrefix('42'))
    expect(cacheService.delCache).toHaveBeenCalledWith(onlineKeys.user('42'))
    expect(cacheService.setCache).toHaveBeenCalledWith(authKeys.passwordVersion('42'), 2)
  })

  it('protects the final enabled super administrator from disable, role removal, and delete', async () => {
    transactionalUserRepository.findOne.mockResolvedValue(user())
    assignedSuperQueryBuilder.getExists.mockResolvedValue(true)
    anotherSuperQueryBuilder.getOne.mockResolvedValue(null)

    await expect(service.update('42', { status: UserStatus.DISABLED })).rejects.toThrow('最后一个启用的超级管理员')

    roleQueryBuilder.getMany.mockResolvedValue([{ code: 'auditor', id: '10' }])
    await expect(service.update('42', { roleIds: ['10'] })).rejects.toThrow('最后一个启用的超级管理员')
    await expect(service.remove('42')).rejects.toThrow(ConflictException)
  })

  it('soft-deletes a removable user after clearing role and refresh-token rows', async () => {
    transactionalUserRepository.findOne.mockResolvedValue(user())

    await expect(service.remove('42')).resolves.toBe(true)

    expect(refreshTokenRepository.delete).toHaveBeenCalledWith({ userId: '42' })
    expect(transactionalUserRoleRepository.delete).toHaveBeenCalledWith({ userId: '42' })
    expect(transactionalUserRepository.softDelete).toHaveBeenCalledWith({ id: '42' })
    expect(cacheService.delCache).toHaveBeenCalledWith(authKeys.passwordVersion('42'))
  })

  it('rejects unknown and out-of-range users and maps database races', async () => {
    await expect(service.update('42', { name: '用户' })).rejects.toThrow(NotFoundException)
    await expect(service.remove('9223372036854775808')).rejects.toThrow(UnprocessableEntityException)

    userRepository.manager.transaction
      .mockRejectedValueOnce({ code: '23505', constraint: 'uq_sys_user_username' })
      .mockRejectedValueOnce({ code: '23503' })
      .mockRejectedValueOnce({ code: '40001' })
    await expect(service.remove('42')).rejects.toThrow('登录账号已存在')
    await expect(service.remove('42')).rejects.toThrow('部门或角色关系已发生变化')
    await expect(service.remove('42')).rejects.toThrow(ConflictException)
  })
})
