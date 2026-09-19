import type { Repository } from 'typeorm'
import type { UserRoleService } from '#/modules/user/user-role/user-role.service.js'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ResOp } from '#/common/dto/response.dto.js'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import { SysMenuEntity } from './entities/menu.entity.js'
import { MenuService } from './menu.service.js'
import { MENU_PERMISSIONS, MenuStatus, MenuType } from './menu.types.js'
import { SystemMenuController } from './system-menu.controller.js'

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

describe('vben system menu list', () => {
  const menuRepository = {
    existsBy: jest.fn(),
    find: jest.fn(),
  }
  const userRoleService = {} as UserRoleService
  const service = new MenuService(
    menuRepository as unknown as Repository<SysMenuEntity>,
    userRoleService,
    {} as any,
  )
  const controller = new SystemMenuController(service)

  beforeEach(() => {
    jest.clearAllMocks()
    menuRepository.existsBy.mockResolvedValue(false)
    menuRepository.find.mockResolvedValue([])
  })

  it('returns every menu type and status in a recursively sorted Vben tree', async () => {
    menuRepository.find.mockResolvedValue([
      menu({
        authCode: 'system:menu:list',
        createdAt: new Date('2026-01-01'),
        id: '10',
        meta: { activePath: '/system/menu', order: 20, title: 'System' },
        name: 'System',
        status: MenuStatus.DISABLED,
        type: MenuType.CATALOG,
      }),
      menu({
        authCode: 'system:menu:create',
        id: '11',
        meta: { order: 2, title: 'Create' },
        name: 'CreateMenu',
        path: null,
        pid: '10',
        type: MenuType.BUTTON,
      }),
      menu({
        id: '12',
        meta: { iframeSrc: 'https://docs.example.com', order: 3 },
        name: 'EmbeddedDocs',
        pid: '10',
        type: MenuType.EMBEDDED,
      }),
      menu({
        id: '13',
        meta: { link: 'https://example.com', order: 4 },
        name: 'ExternalLink',
        pid: '10',
        type: MenuType.LINK,
      }),
      menu({
        component: '/dashboard/index',
        id: '20',
        meta: { order: 10 },
        name: 'Dashboard',
        redirect: '/dashboard/workspace',
      }),
    ])

    await expect(service.getSystemMenuList()).resolves.toEqual([
      {
        component: '/dashboard/index',
        id: '20',
        meta: { order: 10 },
        name: 'Dashboard',
        path: '/dashboard',
        redirect: '/dashboard/workspace',
        status: MenuStatus.ENABLED,
        type: MenuType.MENU,
      },
      {
        activePath: '/system/menu',
        authCode: 'system:menu:list',
        children: [
          {
            authCode: 'system:menu:create',
            id: '11',
            meta: { order: 2, title: 'Create' },
            name: 'CreateMenu',
            pid: '10',
            status: MenuStatus.ENABLED,
            type: MenuType.BUTTON,
          },
          {
            id: '12',
            meta: { iframeSrc: 'https://docs.example.com', order: 3 },
            name: 'EmbeddedDocs',
            path: '/embeddeddocs',
            pid: '10',
            status: MenuStatus.ENABLED,
            type: MenuType.EMBEDDED,
          },
          {
            id: '13',
            meta: { link: 'https://example.com', order: 4 },
            name: 'ExternalLink',
            path: '/externallink',
            pid: '10',
            status: MenuStatus.ENABLED,
            type: MenuType.LINK,
          },
        ],
        id: '10',
        meta: { activePath: '/system/menu', order: 20, title: 'System' },
        name: 'System',
        path: '/system',
        status: MenuStatus.DISABLED,
        type: MenuType.CATALOG,
      },
    ])
    expect(menuRepository.find).toHaveBeenCalledWith({
      select: {
        authCode: true,
        component: true,
        id: true,
        meta: true,
        name: true,
        path: true,
        pid: true,
        redirect: true,
        status: true,
        type: true,
      },
    })
  })

  it('returns every corrupt record once without producing cyclic JSON', async () => {
    menuRepository.find.mockResolvedValue([
      menu({ id: '1', name: 'Orphan', pid: '99' }),
      menu({ id: '2', name: 'Self', pid: '2' }),
      menu({ id: '3', meta: { order: 20 }, name: 'CycleA', pid: '4' }),
      menu({ id: '4', meta: { order: 10 }, name: 'CycleB', pid: '3' }),
    ])

    const result = await service.getSystemMenuList()
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ id: '1', name: 'Orphan' })
    expect(result[0]).not.toHaveProperty('pid')
    expect(result[1]).toMatchObject({ id: '2', name: 'Self' })
    expect(result[1]).not.toHaveProperty('pid')
    expect(result[2]).toMatchObject({
      children: [expect.objectContaining({ id: '3', pid: '4' })],
      id: '4',
      name: 'CycleB',
    })
    expect(result[2]).not.toHaveProperty('pid')
    expect(JSON.stringify(result).match(/"id":"[1-4]"/g)).toHaveLength(4)
  })

  it('exposes the protected system path through the canonical response envelope', async () => {
    menuRepository.find.mockResolvedValue([menu({ id: '9007199254740993', name: 'System' })])

    const data = await controller.list()
    expect(ResOp.success(data)).toMatchObject({
      code: 0,
      data: [{ id: '9007199254740993', name: 'System' }],
      success: true,
    })
    expect(Reflect.getMetadata(PATH_METADATA, SystemMenuController)).toBe('system/menu')
    expect(Reflect.getMetadata(PATH_METADATA, SystemMenuController.prototype.list)).toBe('list')
    expect(Reflect.getMetadata(PERMISSION_KEY, SystemMenuController.prototype.list)).toBe(
      MENU_PERMISSIONS.LIST,
    )
  })

  it('checks exact names and paths while excluding the menu being edited', async () => {
    menuRepository.existsBy
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(controller.nameExists({ id: '7', name: 'SystemMenu' })).resolves.toBe(true)
    await expect(controller.pathExists({ id: '7', path: '/system/menu' })).resolves.toBe(false)

    const nameWhere = menuRepository.existsBy.mock.calls[0][0]
    const pathWhere = menuRepository.existsBy.mock.calls[1][0]
    expect(nameWhere).toMatchObject({ name: 'SystemMenu' })
    expect(nameWhere.id).toMatchObject({ _type: 'not', _value: '7' })
    expect(pathWhere).toMatchObject({ path: '/system/menu' })
    expect(pathWhere.id).toMatchObject({ _type: 'not', _value: '7' })
  })

  it('checks all records when an edit ID is not supplied and preserves ResOp<boolean>', async () => {
    menuRepository.existsBy.mockResolvedValue(true)

    const data = await controller.nameExists({ name: 'systemMenu' })
    expect(data).toBe(true)
    expect(menuRepository.existsBy).toHaveBeenCalledWith({ name: 'systemMenu' })
    expect(ResOp.success(data)).toMatchObject({ code: 0, data: true, success: true })
  })

  it.each([
    ['nameExists', 'name-exists'],
    ['pathExists', 'path-exists'],
  ] as const)('protects %s at its Vben route with menu-list permission', (method, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemMenuController.prototype[method])).toBe(path)
    expect(Reflect.getMetadata(PERMISSION_KEY, SystemMenuController.prototype[method])).toBe(
      MENU_PERMISSIONS.LIST,
    )
  })

  it.each([
    ['create', '/', MENU_PERMISSIONS.CREATE],
    ['update', ':id', MENU_PERMISSIONS.UPDATE],
    ['remove', ':id', MENU_PERMISSIONS.DELETE],
  ] as const)('protects the %s write route with its dedicated permission', (method, path, permission) => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemMenuController.prototype[method])).toBe(path)
    expect(Reflect.getMetadata(PERMISSION_KEY, SystemMenuController.prototype[method])).toBe(permission)
  })

  it('delegates write DTOs and preserves ResOp<boolean>', async () => {
    const create = jest.spyOn(service, 'createMenu').mockResolvedValueOnce(true)
    const update = jest.spyOn(service, 'updateMenu').mockResolvedValueOnce(true)
    const remove = jest.spyOn(service, 'deleteMenu').mockResolvedValueOnce(true)
    const dto = {
      component: '/system/menu/list',
      meta: { title: 'system.menu.title' },
      name: 'SystemMenu',
      path: '/system/menu',
      status: MenuStatus.ENABLED,
      type: MenuType.MENU,
    }

    await expect(controller.create(dto)).resolves.toBe(true)
    await expect(controller.update({ id: '7' }, { status: MenuStatus.DISABLED })).resolves.toBe(true)
    await expect(controller.remove({ id: '7' })).resolves.toBe(true)
    expect(create).toHaveBeenCalledWith(dto)
    expect(update).toHaveBeenCalledWith('7', { status: MenuStatus.DISABLED })
    expect(remove).toHaveBeenCalledWith('7')
    expect(ResOp.success(true)).toMatchObject({ code: 0, data: true, success: true })
  })
})
