import type { Repository } from 'typeorm'
import type { CacheService } from '#/shared/cache/cache.service.js'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ResOp } from '#/common/dto/response.dto.js'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import SysRoleMenuEntity from './entities/role-menu.entity.js'
import { SysRoleEntity } from './entities/role.entity.js'
import { RoleController } from './role.controller.js'
import { RoleService } from './role.service.js'
import { ROLE_PERMISSIONS, RoleStatus } from './role.types.js'

function role(overrides: Partial<SysRoleEntity> = {}): SysRoleEntity {
  return {
    code: 'finance-manager',
    createdAt: new Date('2026-09-08T00:00:00.000Z'),
    id: '10',
    isDefault: false,
    name: '财务管理员',
    remark: null,
    status: RoleStatus.ENABLED,
    ...overrides,
  } as SysRoleEntity
}

describe('vben role list and controller contract', () => {
  const queryBuilder = {
    addOrderBy: jest.fn(),
    andWhere: jest.fn(),
    getManyAndCount: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
  }
  const roleRepository = {
    createQueryBuilder: jest.fn(),
  }
  const roleMenuRepository = {
    find: jest.fn(),
  }
  const service = new RoleService(
    roleRepository as unknown as Repository<SysRoleEntity>,
    roleMenuRepository as unknown as Repository<SysRoleMenuEntity>,
    {} as CacheService,
  )
  const controller = new RoleController(service)

  beforeEach(() => {
    jest.clearAllMocks()
    for (const method of ['addOrderBy', 'andWhere', 'orderBy', 'skip', 'take'] as const)
      queryBuilder[method].mockReturnValue(queryBuilder)
    queryBuilder.getManyAndCount.mockResolvedValue([[], 0])
    roleRepository.createQueryBuilder.mockReturnValue(queryBuilder)
    roleMenuRepository.find.mockResolvedValue([])
  })

  it('returns Vben {items,total} data with sorted bigint permission IDs', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([
      [role({ id: '9007199254740993', isDefault: true, remark: 'Finance' })],
      1,
    ])
    roleMenuRepository.find.mockResolvedValue([
      { menuId: '20', roleId: '9007199254740993' },
      { menuId: '3', roleId: '9007199254740993' },
    ])

    await expect(controller.list({ page: 1, pageSize: 20 })).resolves.toEqual({
      items: [{
        code: 'finance-manager',
        createTime: new Date('2026-09-08T00:00:00.000Z'),
        id: '9007199254740993',
        isDefault: true,
        name: '财务管理员',
        permissions: ['3', '20'],
        remark: 'Finance',
        status: RoleStatus.ENABLED,
      }],
      total: 1,
    })
    expect(roleMenuRepository.find).toHaveBeenCalledWith({
      select: { menuId: true, roleId: true },
      where: { roleId: expect.objectContaining({ _type: 'in' }) },
    })
  })

  it('applies every Vben filter, escapes wildcard input, and paginates stably', async () => {
    await service.list({
      endTime: '2026-09-08T23:59:59.000Z',
      id: '9007199254740993',
      name: 'Ops%_',
      page: 2,
      pageSize: 25,
      remark: 'core_',
      startTime: '2026-09-01T00:00:00.000Z',
      status: RoleStatus.DISABLED,
    })

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('role.id = :id', { id: '9007199254740993' })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('role.name ILIKE :name', { name: '%Ops\\%\\_%' })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('role.remark ILIKE :remark', { remark: '%core\\_%' })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('role.status = :status', { status: 0 })
    expect(queryBuilder.skip).toHaveBeenCalledWith(25)
    expect(queryBuilder.take).toHaveBeenCalledWith(25)
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('role.createdAt', 'DESC')
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('role.id', 'DESC')
  })

  it('rejects reversed time ranges before querying', async () => {
    await expect(service.list({
      endTime: '2026-09-01T00:00:00.000Z',
      page: 1,
      pageSize: 20,
      startTime: '2026-09-08T00:00:00.000Z',
    })).rejects.toThrow('startTime 不能晚于 endTime')
    expect(roleRepository.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('publishes protected routes with dedicated permissions and response envelopes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RoleController)).toBe('role')
    expect(Reflect.getMetadata(PATH_METADATA, RoleController.prototype.list)).toBe('list')
    expect(Reflect.getMetadata(PERMISSION_KEY, RoleController.prototype.list)).toBe(ROLE_PERMISSIONS.LIST)

    for (const [method, path, permission] of [
      ['create', '/', ROLE_PERMISSIONS.CREATE],
      ['update', ':id', ROLE_PERMISSIONS.UPDATE],
      ['remove', ':id', ROLE_PERMISSIONS.DELETE],
    ] as const) {
      expect(Reflect.getMetadata(PATH_METADATA, RoleController.prototype[method])).toBe(path)
      expect(Reflect.getMetadata(PERMISSION_KEY, RoleController.prototype[method])).toBe(permission)
    }
    expect(ResOp.success({ items: [], total: 0 })).toMatchObject({
      code: 0,
      data: { items: [], total: 0 },
      success: true,
    })
    expect(ResOp.success(true)).toMatchObject({ code: 0, data: true, success: true })
  })

  it('delegates Vben write DTOs without changing values', async () => {
    const create = jest.spyOn(service, 'create').mockResolvedValueOnce(true)
    const update = jest.spyOn(service, 'update').mockResolvedValueOnce(true)
    const remove = jest.spyOn(service, 'remove').mockResolvedValueOnce(true)
    const dto = { name: '财务管理员', permissions: ['1'], status: RoleStatus.ENABLED }

    await expect(controller.create(dto)).resolves.toBe(true)
    await expect(controller.update({ id: '7' }, { status: RoleStatus.DISABLED })).resolves.toBe(true)
    await expect(controller.remove({ id: '7' })).resolves.toBe(true)
    expect(create).toHaveBeenCalledWith(dto)
    expect(update).toHaveBeenCalledWith('7', { status: RoleStatus.DISABLED })
    expect(remove).toHaveBeenCalledWith('7')
  })
})
