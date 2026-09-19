import type { Repository } from 'typeorm'
import { RoleStatus } from '#/modules/system/role/role.types.js'
import SysUserRoleEntity from '../entities/user-role.entity.js'
import { UserRoleService } from './user-role.service.js'

describe('effective user roles', () => {
  const queryBuilder = {
    andWhere: jest.fn(),
    getMany: jest.fn(),
    innerJoinAndSelect: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
  }
  const repository = {
    createQueryBuilder: jest.fn(),
  }
  const service = new UserRoleService(
    repository as unknown as Repository<SysUserRoleEntity>,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    for (const method of ['andWhere', 'innerJoinAndSelect', 'select', 'where'] as const)
      queryBuilder[method].mockReturnValue(queryBuilder)
    repository.createQueryBuilder.mockReturnValue(queryBuilder)
    queryBuilder.getMany.mockResolvedValue([
      { role: { code: 'admin' } },
    ])
  })

  it('excludes disabled roles from the current login context', async () => {
    await expect(service.getUserRoleCodes('42')).resolves.toEqual(['admin'])

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'role.status = :status',
      { status: RoleStatus.ENABLED },
    )
  })
})
