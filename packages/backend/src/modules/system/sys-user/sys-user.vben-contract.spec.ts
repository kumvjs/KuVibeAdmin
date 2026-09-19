import type { Repository } from 'typeorm'
import type { CacheService } from '#/shared/cache/cache.service.js'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ResOp } from '#/common/dto/response.dto.js'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import SysUserRoleEntity from '#/modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { SysUserController } from './sys-user.controller.js'
import { SysUserService } from './sys-user.service.js'
import { SYS_USER_PERMISSIONS, UserStatus } from './sys-user.types.js'

describe('vben system-user contract', () => {
  const queryBuilder = {
    addOrderBy: jest.fn(),
    andWhere: jest.fn(),
    getManyAndCount: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
  }
  const userRepository = {
    createQueryBuilder: jest.fn(),
  }
  const userRoleRepository = {
    find: jest.fn(),
  }
  const service = new SysUserService(
    userRepository as unknown as Repository<SysUserEntity>,
    userRoleRepository as unknown as Repository<SysUserRoleEntity>,
    {} as CacheService,
  )
  const controller = new SysUserController(service)

  beforeEach(() => {
    jest.clearAllMocks()
    for (const method of ['addOrderBy', 'andWhere', 'orderBy', 'skip', 'take'] as const)
      queryBuilder[method].mockReturnValue(queryBuilder)
    userRepository.createQueryBuilder.mockReturnValue(queryBuilder)
    queryBuilder.getManyAndCount.mockResolvedValue([[], 0])
    userRoleRepository.find.mockResolvedValue([])
  })

  it('returns Vben items/total fields and sorted bigint role IDs', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([[
      {
        createdAt: new Date('2026-09-08T00:00:00.000Z'),
        deptId: '3',
        id: '9007199254740993',
        name: '财务用户',
        remark: 'Finance',
        status: UserStatus.ENABLED,
        username: 'finance.user',
      },
    ], 1])
    userRoleRepository.find.mockResolvedValue([
      { roleId: '10', userId: '9007199254740993' },
      { roleId: '2', userId: '9007199254740993' },
    ])

    await expect(controller.list({ page: 1, pageSize: 20 })).resolves.toEqual({
      items: [{
        createTime: new Date('2026-09-08T00:00:00.000Z'),
        deptId: '3',
        id: '9007199254740993',
        name: '财务用户',
        remark: 'Finance',
        roleIds: ['2', '10'],
        status: UserStatus.ENABLED,
        username: 'finance.user',
      }],
      total: 1,
    })
    expect(ResOp.success(await controller.list({ page: 1, pageSize: 20 }))).toMatchObject({
      data: { items: expect.any(Array), total: 1 },
      success: true,
    })
  })

  it('applies locked Vben filters and deterministic pagination', async () => {
    await service.list({
      deptId: '3',
      endTime: '2026-09-08T23:59:59.000Z',
      id: '42',
      name: 'fin%_',
      page: 2,
      pageSize: 50,
      remark: 'ops',
      startTime: '2026-09-01T00:00:00.000Z',
      status: UserStatus.DISABLED,
    })

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.id = :id', { id: '42' })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(user.name ILIKE :name OR user.username ILIKE :name)',
      { name: '%fin\\%\\_%' },
    )
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.deptId = :deptId', { deptId: '3' })
    expect(queryBuilder.skip).toHaveBeenCalledWith(50)
    expect(queryBuilder.take).toHaveBeenCalledWith(50)
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC')
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('user.id', 'DESC')
  })

  it('publishes four permission-protected system routes with boolean writes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SysUserController)).toBe('user')
    expect(Reflect.getMetadata(PERMISSION_KEY, SysUserController.prototype.list))
      .toBe(SYS_USER_PERMISSIONS.LIST)
    expect(Reflect.getMetadata(PERMISSION_KEY, SysUserController.prototype.create))
      .toBe(SYS_USER_PERMISSIONS.CREATE)
    expect(Reflect.getMetadata(PERMISSION_KEY, SysUserController.prototype.update))
      .toBe(SYS_USER_PERMISSIONS.UPDATE)
    expect(Reflect.getMetadata(PERMISSION_KEY, SysUserController.prototype.remove))
      .toBe(SYS_USER_PERMISSIONS.DELETE)
  })
})
