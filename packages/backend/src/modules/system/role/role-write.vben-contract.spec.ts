import type { Repository } from 'typeorm'
import type { CacheService } from '#/shared/cache/cache.service.js'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Roles } from '#/modules/auth/auth.constant.js'
import { SysMenuEntity } from '#/modules/system/menu/entities/menu.entity.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { authKeys } from '#/shared/cache/keys/auth.keys.js'
import SysRoleMenuEntity from './entities/role-menu.entity.js'
import { SysRoleEntity } from './entities/role.entity.js'
import { RoleService } from './role.service.js'
import { RoleStatus } from './role.types.js'

function role(overrides: Partial<SysRoleEntity> = {}): SysRoleEntity {
  return {
    code: 'finance-manager',
    id: '10',
    isDefault: false,
    name: '财务管理员',
    remark: null,
    status: RoleStatus.ENABLED,
    ...overrides,
  } as SysRoleEntity
}

describe('vben role writes', () => {
  const transactionalRoleRepository = {
    create: jest.fn((value: unknown) => value),
    exists: jest.fn(),
    existsBy: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  }
  const transactionalRoleMenuRepository = {
    delete: jest.fn(),
    insert: jest.fn(),
  }
  const menuQueryBuilder = {
    createQueryBuilder: jest.fn(),
    getMany: jest.fn(),
    select: jest.fn(),
    setLock: jest.fn(),
    where: jest.fn(),
  }
  const menuRepository = {
    createQueryBuilder: jest.fn(),
  }
  const assignmentQueryBuilder = {
    getExists: jest.fn(),
    where: jest.fn(),
    withDeleted: jest.fn(),
  }
  const userRoleRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  }
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SysRoleEntity)
        return transactionalRoleRepository
      if (entity === SysRoleMenuEntity)
        return transactionalRoleMenuRepository
      if (entity === SysMenuEntity)
        return menuRepository
      if (entity === SysUserRoleEntity)
        return userRoleRepository
      throw new Error('Unexpected repository')
    }),
  }
  const roleRepository = {
    manager: {
      transaction: jest.fn(async (_isolation: string, operation: (value: typeof manager) => unknown) => operation(manager)),
    },
  }
  const cacheService = { delCache: jest.fn() }
  const service = new RoleService(
    roleRepository as unknown as Repository<SysRoleEntity>,
    {} as Repository<SysRoleMenuEntity>,
    cacheService as unknown as CacheService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    transactionalRoleRepository.exists.mockResolvedValue(false)
    transactionalRoleRepository.existsBy.mockResolvedValue(false)
    transactionalRoleRepository.findOne.mockResolvedValue(null)
    transactionalRoleRepository.save.mockImplementation(async value => ({ id: '10', ...(value as object) }))
    transactionalRoleRepository.softDelete.mockResolvedValue({ affected: 1 })
    transactionalRoleMenuRepository.delete.mockResolvedValue({ affected: 0 })
    transactionalRoleMenuRepository.insert.mockResolvedValue({ identifiers: [] })
    for (const method of ['select', 'setLock', 'where'] as const)
      menuQueryBuilder[method].mockReturnValue(menuQueryBuilder)
    menuQueryBuilder.getMany.mockResolvedValue([])
    menuRepository.createQueryBuilder.mockReturnValue(menuQueryBuilder)
    for (const method of ['where', 'withDeleted'] as const)
      assignmentQueryBuilder[method].mockReturnValue(assignmentQueryBuilder)
    assignmentQueryBuilder.getExists.mockResolvedValue(false)
    userRoleRepository.createQueryBuilder.mockReturnValue(assignmentQueryBuilder)
    userRoleRepository.find.mockResolvedValue([])
    cacheService.delCache.mockResolvedValue(undefined)
  })

  it('creates a role with generated immutable code and atomically validated mappings', async () => {
    menuQueryBuilder.getMany.mockResolvedValue([{ id: '2' }, { id: '10' }])

    await expect(service.create({
      name: '财务管理员',
      permissions: ['10', '2'],
      status: RoleStatus.ENABLED,
    })).resolves.toBe(true)

    expect(roleRepository.manager.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function))
    expect(transactionalRoleRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      code: expect.stringMatching(/^role:[0-9a-f-]{36}$/),
      isDefault: false,
      name: '财务管理员',
      status: RoleStatus.ENABLED,
    }))
    expect(menuQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_read')
    expect(transactionalRoleMenuRepository.delete).toHaveBeenCalledWith({ roleId: '10' })
    expect(transactionalRoleMenuRepository.insert).toHaveBeenCalledWith([
      { menuId: '2', roleId: '10' },
      { menuId: '10', roleId: '10' },
    ])
  })

  it('rejects public creation with reserved role codes or unknown menu IDs', async () => {
    await expect(service.create({
      code: Roles.SUPER,
      name: '超级角色',
      status: RoleStatus.ENABLED,
    })).rejects.toThrow('系统保留')

    menuQueryBuilder.getMany.mockResolvedValue([{ id: '2' }])
    await expect(service.create({
      name: '财务管理员',
      permissions: ['2', '3'],
      status: RoleStatus.ENABLED,
    })).rejects.toThrow('权限菜单不存在：3')
    expect(transactionalRoleRepository.save).not.toHaveBeenCalled()
  })

  it('prechecks active display names and globally retained role codes', async () => {
    transactionalRoleRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.create({
      code: 'finance-manager',
      name: '财务管理员',
      status: RoleStatus.ENABLED,
    })).rejects.toThrow('角色名称已存在')

    transactionalRoleRepository.existsBy.mockResolvedValueOnce(false)
    transactionalRoleRepository.exists.mockResolvedValueOnce(true)
    await expect(service.create({
      code: 'finance-manager',
      name: '财务角色',
      status: RoleStatus.ENABLED,
    })).rejects.toThrow('角色标识已存在')
    expect(transactionalRoleRepository.exists).toHaveBeenLastCalledWith({
      where: { code: 'finance-manager' },
      withDeleted: true,
    })
  })

  it('preserves immutable code and mappings for a partial status update', async () => {
    const current = role()
    transactionalRoleRepository.findOne.mockResolvedValueOnce(current)

    await expect(service.update('10', {
      code: 'attacker-code',
      status: RoleStatus.DISABLED,
    } as any)).resolves.toBe(true)

    expect(current.code).toBe('finance-manager')
    expect(current.status).toBe(RoleStatus.DISABLED)
    expect(transactionalRoleMenuRepository.delete).not.toHaveBeenCalled()
    expect(transactionalRoleRepository.save).toHaveBeenCalledWith(current)
  })

  it('replaces permissions and invalidates every distinct assignee after commit', async () => {
    const current = role()
    transactionalRoleRepository.findOne.mockResolvedValueOnce(current)
    menuQueryBuilder.getMany.mockResolvedValue([{ id: '2' }, { id: '3' }])
    userRoleRepository.find.mockResolvedValue([
      { userId: '42' },
      { userId: '7' },
      { userId: '42' },
    ])

    await expect(service.update('10', { permissions: ['3', '2'] })).resolves.toBe(true)

    expect(transactionalRoleMenuRepository.delete).toHaveBeenCalledWith({ roleId: '10' })
    expect(transactionalRoleMenuRepository.insert).toHaveBeenCalledWith([
      { menuId: '2', roleId: '10' },
      { menuId: '3', roleId: '10' },
    ])
    expect(cacheService.delCache.mock.calls).toEqual([
      [authKeys.userPermissions('42')],
      [authKeys.userPermissions('7')],
    ])
  })

  it.each([
    [role({ code: Roles.SUPER }), '超级'],
    [role({ isDefault: true }), '默认'],
  ])('protects system role %# from disabling and deletion', async (current, message) => {
    transactionalRoleRepository.findOne.mockResolvedValue(current)

    await expect(service.update('10', { status: RoleStatus.DISABLED })).rejects.toThrow(message)
    await expect(service.remove('10')).rejects.toThrow(message)
  })

  it('rejects deletion while any persisted user-role reference remains', async () => {
    transactionalRoleRepository.findOne.mockResolvedValue(role())
    assignmentQueryBuilder.getExists.mockResolvedValueOnce(true)

    await expect(service.remove('10')).rejects.toThrow('角色仍被用户引用')
    expect(assignmentQueryBuilder.withDeleted).toHaveBeenCalledTimes(1)
    expect(transactionalRoleMenuRepository.delete).not.toHaveBeenCalled()
  })

  it('hard-removes mappings then soft-deletes an unassigned custom role', async () => {
    transactionalRoleRepository.findOne.mockResolvedValue(role({ id: '9007199254740993' }))

    await expect(service.remove('9007199254740993')).resolves.toBe(true)
    expect(transactionalRoleMenuRepository.delete).toHaveBeenCalledWith({ roleId: '9007199254740993' })
    expect(transactionalRoleRepository.softDelete).toHaveBeenCalledWith({ id: '9007199254740993' })
  })

  it('rejects unknown roles and identities outside PostgreSQL bigint', async () => {
    await expect(service.update('10', { name: '新角色' })).rejects.toThrow(NotFoundException)
    await expect(service.remove('9223372036854775808')).rejects.toThrow(UnprocessableEntityException)
  })

  it('maps unique, foreign-key, and serialization races to stable conflicts', async () => {
    roleRepository.manager.transaction
      .mockRejectedValueOnce({ code: '23505', constraint: 'uq_sys_role_code' })
      .mockRejectedValueOnce({ code: '23503' })
      .mockRejectedValueOnce({ code: '40001' })

    await expect(
      service.create({ name: '财务管理员', status: RoleStatus.ENABLED }),
    ).rejects.toThrow('角色标识已存在')
    await expect(service.remove('10')).rejects.toThrow('角色授权关系已发生变化')
    await expect(service.remove('10')).rejects.toThrow(ConflictException)
  })
})
