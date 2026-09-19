import type { Repository } from 'typeorm'
import type { UserRoleService } from '#/modules/user/user-role/user-role.service.js'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ResOp } from '#/common/dto/response.dto.js'
import { Roles } from '#/modules/auth/auth.constant.js'
import { RoleStatus } from '../role/role.types.js'
import { SysMenuEntity } from './entities/menu.entity.js'
import { MenuController } from './menu.controller.js'
import { MenuService } from './menu.service.js'
import { MenuStatus, MenuType } from './menu.types.js'

function menu(input: Partial<SysMenuEntity> & Pick<SysMenuEntity, 'id' | 'name'>): SysMenuEntity {
  return {
    meta: {},
    path: `/${input.name.toLowerCase()}`,
    pid: null,
    status: MenuStatus.ENABLED,
    type: MenuType.MENU,
    ...input,
  } as SysMenuEntity
}

describe('vben runtime dynamic menus', () => {
  const queryBuilder = {
    andWhere: jest.fn(),
    distinct: jest.fn(),
    getRawMany: jest.fn(),
    innerJoin: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
  }
  const menuRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  }
  const userRoleService = {
    getRoleIdsByUser: jest.fn(),
    getUserRoleCodes: jest.fn(),
  }
  const service = new MenuService(
    menuRepository as unknown as Repository<SysMenuEntity>,
    userRoleService as unknown as UserRoleService,
    {} as any,
  )
  const controller = new MenuController(service)

  beforeEach(() => {
    jest.clearAllMocks()
    for (const method of ['andWhere', 'distinct', 'innerJoin', 'select', 'where'] as const)
      queryBuilder[method].mockReturnValue(queryBuilder)
    menuRepository.createQueryBuilder.mockReturnValue(queryBuilder)
    menuRepository.find.mockResolvedValue([])
    queryBuilder.getRawMany.mockResolvedValue([])
    userRoleService.getRoleIdsByUser.mockResolvedValue([])
    userRoleService.getUserRoleCodes.mockResolvedValue([])
  })

  it('includes enabled ancestors of granted routes and buttons in deterministic order', async () => {
    userRoleService.getRoleIdsByUser.mockResolvedValue(['10'])
    userRoleService.getUserRoleCodes.mockResolvedValue(['admin'])
    menuRepository.find.mockResolvedValue([
      menu({ id: '1', meta: { order: 20, title: 'System' }, name: 'System' }),
      menu({ id: '2', meta: { order: 2 }, name: 'Users', pid: '1' }),
      menu({ id: '3', name: 'CreateUser', path: null, pid: '2', type: MenuType.BUTTON }),
      menu({ id: '4', name: 'Orphan', pid: '99' }),
      menu({ id: '5', name: 'CycleA', pid: '6' }),
      menu({ id: '6', name: 'CycleB', pid: '5' }),
      menu({ id: '7', name: 'PathlessRoot', path: null }),
      menu({ id: '8', name: 'PathlessChild', pid: '7' }),
      menu({ id: '9', meta: { order: 10 }, name: 'Dashboard' }),
    ])
    queryBuilder.getRawMany.mockResolvedValue([
      { id: '3' },
      { id: '4' },
      { id: '5' },
      { id: '8' },
      { id: '9' },
    ])

    await expect(service.getAllMenusByUserId('42')).resolves.toEqual([
      {
        meta: { order: 10 },
        name: 'Dashboard',
        path: '/dashboard',
      },
      {
        children: [{ meta: { order: 2 }, name: 'Users', path: '/users' }],
        meta: { order: 20, title: 'System' },
        name: 'System',
        path: '/system',
      },
    ])
    expect(menuRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: MenuStatus.ENABLED },
    }))
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'roleMenu.roleId IN (:...roleIds)',
      { roleIds: ['10'] },
    )
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'role.status = :roleStatus',
      { roleStatus: RoleStatus.ENABLED },
    )
  })

  it('returns every valid enabled route for an enabled super role without mapping queries', async () => {
    userRoleService.getRoleIdsByUser.mockResolvedValue(['1'])
    userRoleService.getUserRoleCodes.mockResolvedValue([Roles.SUPER])
    menuRepository.find.mockResolvedValue([
      menu({ id: '1', meta: { order: 10 }, name: 'System' }),
      menu({ component: '/system/user/list', id: '2', name: 'Users', pid: '1', redirect: '/system/user' }),
      menu({ id: '3', name: 'CreateUser', path: null, pid: '2', type: MenuType.BUTTON }),
    ])

    await expect(service.getAllMenusByUserId('42')).resolves.toEqual([
      {
        children: [{
          component: '/system/user/list',
          meta: {},
          name: 'Users',
          path: '/users',
          redirect: '/system/user',
        }],
        meta: { order: 10 },
        name: 'System',
        path: '/system',
      },
    ])
    expect(menuRepository.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('returns an empty tree without assigned roles or querying menus', async () => {
    await expect(service.getAllMenusByUserId('42')).resolves.toEqual([])

    expect(menuRepository.find).not.toHaveBeenCalled()
    expect(menuRepository.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('exposes the runtime tree through the canonical ResOp contract', async () => {
    const route = menu({ id: '1', name: 'Dashboard' })
    userRoleService.getRoleIdsByUser.mockResolvedValue(['1'])
    userRoleService.getUserRoleCodes.mockResolvedValue([Roles.SUPER])
    menuRepository.find.mockResolvedValue([route])

    const data = await controller.all({ uid: '42' } as LoginUserContext)
    expect(ResOp.success(data)).toMatchObject({
      code: 0,
      data: [{ meta: {}, name: 'Dashboard', path: '/dashboard' }],
      success: true,
    })
    expect(Reflect.getMetadata(PATH_METADATA, MenuController)).toBe('menu')
    expect(Reflect.getMetadata(PATH_METADATA, MenuController.prototype.all)).toBe('all')
  })
})
