import type { Repository } from 'typeorm'
import type { UserRoleService } from '#/modules/user/user-role/user-role.service.js'
import type { CacheService } from '#/shared/cache/cache.service.js'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { authKeys } from '#/shared/cache/keys/auth.keys.js'
import SysRoleMenuEntity from '../role/entities/role-menu.entity.js'
import { SysMenuEntity } from './entities/menu.entity.js'
import { MenuService } from './menu.service.js'
import { MenuStatus, MenuType } from './menu.types.js'

function menu(overrides: Partial<SysMenuEntity> = {}): SysMenuEntity {
  return {
    authCode: null,
    component: '/system/menu/list',
    id: '10',
    meta: { title: 'system.menu.title' },
    name: 'SystemMenu',
    path: '/system/menu',
    pid: null,
    redirect: null,
    status: MenuStatus.ENABLED,
    type: MenuType.MENU,
    ...overrides,
  } as SysMenuEntity
}

describe('vben system menu writes', () => {
  const transactionalMenuRepository = {
    create: jest.fn((value: unknown) => value),
    existsBy: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  }
  const roleMenuRepository = {
    existsBy: jest.fn(),
  }
  const affectedUserQueryBuilder = {
    andWhere: jest.fn(),
    distinct: jest.fn(),
    getRawMany: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
  }
  const userRoleRepository = {
    createQueryBuilder: jest.fn(),
  }
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SysMenuEntity)
        return transactionalMenuRepository
      if (entity === SysRoleMenuEntity)
        return roleMenuRepository
      if (entity === SysUserRoleEntity)
        return userRoleRepository
      throw new Error('Unexpected repository')
    }),
  }
  const menuRepository = {
    manager: {
      transaction: jest.fn(async (_isolation: string, operation: (value: typeof manager) => unknown) => operation(manager)),
    },
  }
  const cacheService = {
    delCache: jest.fn(),
  }
  const service = new MenuService(
    menuRepository as unknown as Repository<SysMenuEntity>,
    {} as UserRoleService,
    cacheService as unknown as CacheService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    transactionalMenuRepository.existsBy.mockResolvedValue(false)
    transactionalMenuRepository.findOne.mockResolvedValue(null)
    transactionalMenuRepository.save.mockImplementation(async value => value)
    transactionalMenuRepository.softDelete.mockResolvedValue({ affected: 1 })
    roleMenuRepository.existsBy.mockResolvedValue(false)
    for (const method of ['andWhere', 'distinct', 'innerJoin', 'leftJoin', 'select', 'where'] as const)
      affectedUserQueryBuilder[method].mockReturnValue(affectedUserQueryBuilder)
    affectedUserQueryBuilder.getRawMany.mockResolvedValue([])
    userRoleRepository.createQueryBuilder.mockReturnValue(affectedUserQueryBuilder)
    cacheService.delCache.mockResolvedValue(undefined)
  })

  it('creates an embedded menu and maps linkSrc into JSONB metadata', async () => {
    const result = await service.createMenu({
      linkSrc: 'https://docs.example.com',
      meta: { order: 10, title: 'docs.title' },
      name: 'EmbeddedDocs',
      path: '/docs',
      pid: '0',
      status: MenuStatus.ENABLED,
      type: MenuType.EMBEDDED,
    })

    expect(result).toBe(true)
    expect(menuRepository.manager.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function))
    expect(transactionalMenuRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      meta: { iframeSrc: 'https://docs.example.com', order: 10, title: 'docs.title' },
      path: '/docs',
      pid: null,
      type: MenuType.EMBEDDED,
    }))
    expect(transactionalMenuRepository.save).toHaveBeenCalledTimes(1)
  })

  it('locks and validates a parent-capable ancestor chain', async () => {
    transactionalMenuRepository.findOne
      .mockResolvedValueOnce(menu({ id: '2', name: 'Parent', path: '/parent', pid: '1', type: MenuType.MENU }))
      .mockResolvedValueOnce(menu({ id: '1', name: 'Root', path: '/root', type: MenuType.CATALOG }))

    await expect(service.createMenu({
      authCode: 'system:menu:create',
      meta: { title: 'common.create' },
      name: 'CreateMenu',
      pid: '2',
      status: MenuStatus.ENABLED,
      type: MenuType.BUTTON,
    })).resolves.toBe(true)

    expect(transactionalMenuRepository.findOne).toHaveBeenNthCalledWith(1, expect.objectContaining({
      lock: { mode: 'pessimistic_read' },
      where: { id: '2' },
    }))
  })

  it('rejects missing and leaf parents', async () => {
    const create = {
      authCode: 'system:menu:create',
      meta: { title: 'common.create' },
      name: 'CreateMenu',
      pid: '2',
      status: MenuStatus.ENABLED,
      type: MenuType.BUTTON,
    }

    await expect(service.createMenu(create)).rejects.toThrow(UnprocessableEntityException)

    transactionalMenuRepository.findOne.mockResolvedValue(menu({ id: '2', type: MenuType.BUTTON }))
    await expect(service.createMenu(create)).rejects.toThrow('父菜单必须是 catalog 或 menu 类型')
  })

  it('rejects self-parenting and descendant reparenting', async () => {
    transactionalMenuRepository.findOne
      .mockResolvedValueOnce(menu())

    await expect(service.updateMenu('10', { pid: '10' })).rejects.toThrow('父子关系不能形成循环')

    transactionalMenuRepository.findOne
      .mockReset()
      .mockResolvedValueOnce(menu())
      .mockResolvedValueOnce(menu({ id: '20', name: 'Child', path: '/child', pid: '30' }))
      .mockResolvedValueOnce(menu({ id: '30', name: 'Grandchild', path: '/grandchild', pid: '10' }))

    await expect(service.updateMenu('10', { pid: '20' })).rejects.toThrow('父子关系不能形成循环')
  })

  it('rejects converting a node with children into a leaf type', async () => {
    transactionalMenuRepository.findOne.mockResolvedValueOnce(menu())
    transactionalMenuRepository.existsBy.mockImplementation(async (where: Record<string, unknown>) => 'pid' in where)

    await expect(service.updateMenu('10', {
      linkSrc: 'https://example.com',
      type: MenuType.LINK,
    })).rejects.toThrow('存在子菜单的节点不能修改为叶子类型')
  })

  it('rejects duplicate values before saving and maps concurrent unique failures', async () => {
    transactionalMenuRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.createMenu({
      meta: { title: 'system.title' },
      name: 'System',
      path: '/system',
      status: MenuStatus.ENABLED,
      type: MenuType.CATALOG,
    })).rejects.toThrow('name 已存在')

    transactionalMenuRepository.existsBy.mockResolvedValue(false)
    transactionalMenuRepository.save.mockRejectedValue({
      code: '23505',
      constraint: 'uq_sys_menu_auth_code',
    })
    await expect(service.createMenu({
      authCode: 'system:menu:list',
      component: '/system/menu/list',
      meta: { title: 'system.menu.title' },
      name: 'SystemMenu',
      path: '/system/menu',
      status: MenuStatus.ENABLED,
      type: MenuType.MENU,
    })).rejects.toThrow('authCode 已存在')
  })

  it('requires activePath to reference another active menu path', async () => {
    transactionalMenuRepository.existsBy.mockResolvedValue(false)

    await expect(service.createMenu({
      activePath: '/missing',
      component: '/system/menu/list',
      meta: { title: 'system.menu.title' },
      name: 'SystemMenu',
      path: '/system/menu',
      status: MenuStatus.ENABLED,
      type: MenuType.MENU,
    })).rejects.toThrow('activePath 必须指向另一个已存在的菜单路径')
  })

  it('updates a locked active record and rejects an unknown ID', async () => {
    await expect(
      service.updateMenu('10', { status: MenuStatus.DISABLED }),
    ).rejects.toThrow(NotFoundException)

    const current = menu()
    transactionalMenuRepository.findOne.mockResolvedValueOnce(current)
    await expect(service.updateMenu('10', { status: MenuStatus.DISABLED })).resolves.toBe(true)
    expect(current.status).toBe(MenuStatus.DISABLED)
    expect(transactionalMenuRepository.save).toHaveBeenCalledWith(current)
  })

  it('rejects delete while children or role references remain', async () => {
    transactionalMenuRepository.findOne.mockResolvedValue(menu())
    transactionalMenuRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.deleteMenu('10')).rejects.toThrow('菜单仍有子节点')

    transactionalMenuRepository.existsBy.mockResolvedValueOnce(false)
    roleMenuRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.deleteMenu('10')).rejects.toThrow('菜单仍被角色引用')
  })

  it('soft deletes an unreferenced leaf and preserves bigint string identity', async () => {
    transactionalMenuRepository.findOne.mockResolvedValue(menu({ id: '9007199254740993' }))

    await expect(service.deleteMenu('9007199254740993')).resolves.toBe(true)
    expect(roleMenuRepository.existsBy).toHaveBeenCalledWith({ menuId: '9007199254740993' })
    expect(transactionalMenuRepository.softDelete).toHaveBeenCalledWith({ id: '9007199254740993' })
  })

  it('invalidates distinct affected role users and enabled super users after commit', async () => {
    transactionalMenuRepository.findOne.mockResolvedValueOnce(menu())
    affectedUserQueryBuilder.getRawMany.mockResolvedValue([
      { userId: '42' },
      { userId: '7' },
      { userId: '42' },
    ])

    await expect(service.updateMenu('10', { status: MenuStatus.DISABLED })).resolves.toBe(true)

    expect(affectedUserQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(role.code = :superCode OR roleMenu.menuId = :menuId)',
      expect.objectContaining({ menuId: '10', superCode: 'super' }),
    )
    expect(cacheService.delCache.mock.calls).toEqual([
      [authKeys.userPermissions('42')],
      [authKeys.userPermissions('7')],
    ])
  })

  it('maps serialization races to a retryable conflict', async () => {
    menuRepository.manager.transaction.mockRejectedValueOnce({ code: '40001' })

    await expect(service.deleteMenu('10')).rejects.toThrow(ConflictException)
    await expect(service.deleteMenu('0')).rejects.toThrow(UnprocessableEntityException)
  })
})
