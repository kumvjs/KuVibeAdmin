import type { Repository } from 'typeorm'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { DeptService } from './dept.service.js'
import { DeptStatus } from './dept.types.js'
import { SysDeptEntity } from './entities/dept.entity.js'

function department(overrides: Partial<SysDeptEntity> = {}): SysDeptEntity {
  return {
    id: '10',
    name: '研发中心',
    order: 10,
    pid: null,
    remark: null,
    status: DeptStatus.ENABLED,
    ...overrides,
  } as SysDeptEntity
}

describe('vben department writes', () => {
  const transactionalDeptRepository = {
    create: jest.fn((value: unknown) => value),
    existsBy: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  }
  const userReferenceQueryBuilder = {
    createQueryBuilder: jest.fn(),
    getExists: jest.fn(),
    where: jest.fn(),
    withDeleted: jest.fn(),
  }
  const userRepository = {
    createQueryBuilder: jest.fn(),
  }
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SysDeptEntity)
        return transactionalDeptRepository
      if (entity === SysUserEntity)
        return userRepository
      throw new Error('Unexpected repository')
    }),
  }
  const deptRepository = {
    manager: {
      transaction: jest.fn(async (_isolation: string, operation: (value: typeof manager) => unknown) => operation(manager)),
    },
  }
  const service = new DeptService(deptRepository as unknown as Repository<SysDeptEntity>)

  beforeEach(() => {
    jest.clearAllMocks()
    transactionalDeptRepository.existsBy.mockResolvedValue(false)
    transactionalDeptRepository.findOne.mockResolvedValue(null)
    transactionalDeptRepository.save.mockImplementation(async value => value)
    transactionalDeptRepository.softDelete.mockResolvedValue({ affected: 1 })
    for (const method of ['where', 'withDeleted'] as const)
      userReferenceQueryBuilder[method].mockReturnValue(userReferenceQueryBuilder)
    userReferenceQueryBuilder.getExists.mockResolvedValue(false)
    userRepository.createQueryBuilder.mockReturnValue(userReferenceQueryBuilder)
  })

  it('creates a root with normalized pid and explicit stable order', async () => {
    await expect(service.create({
      name: '研发中心',
      order: 20,
      pid: '0',
      status: DeptStatus.ENABLED,
    })).resolves.toBe(true)

    expect(deptRepository.manager.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function))
    expect(transactionalDeptRepository.create).toHaveBeenCalledWith({
      name: '研发中心',
      order: 20,
      pid: null,
      remark: null,
      status: DeptStatus.ENABLED,
    })
  })

  it('locks and validates the complete parent chain', async () => {
    transactionalDeptRepository.findOne
      .mockResolvedValueOnce(department({ id: '2', name: '平台组', pid: '1' }))
      .mockResolvedValueOnce(department({ id: '1', name: '总公司' }))

    await expect(service.create({
      name: '服务端组',
      pid: '2',
      status: DeptStatus.ENABLED,
    })).resolves.toBe(true)

    expect(transactionalDeptRepository.findOne).toHaveBeenNthCalledWith(1, expect.objectContaining({
      lock: { mode: 'pessimistic_read' },
      where: { id: '2' },
    }))
    expect(transactionalDeptRepository.findOne).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: '1' },
    }))
  })

  it('rejects missing parents, self-parenting, and descendant reparenting', async () => {
    await expect(service.create({
      name: '服务端组',
      pid: '2',
      status: DeptStatus.ENABLED,
    })).rejects.toThrow(UnprocessableEntityException)

    transactionalDeptRepository.findOne.mockResolvedValueOnce(department())
    await expect(service.update('10', { pid: '10' })).rejects.toThrow('父子关系不能形成循环')

    transactionalDeptRepository.findOne
      .mockReset()
      .mockResolvedValueOnce(department())
      .mockResolvedValueOnce(department({ id: '20', name: '子部门', pid: '30' }))
      .mockResolvedValueOnce(department({ id: '30', name: '孙部门', pid: '10' }))
    await expect(service.update('10', { pid: '20' })).rejects.toThrow('父子关系不能形成循环')
  })

  it('rejects exact duplicate sibling names for roots and children', async () => {
    transactionalDeptRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.create({
      name: '研发中心',
      status: DeptStatus.ENABLED,
    })).rejects.toThrow('同级部门名称已存在')

    transactionalDeptRepository.findOne.mockResolvedValueOnce(department({ id: '1', name: '总公司' }))
    transactionalDeptRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.create({
      name: '研发中心',
      pid: '1',
      status: DeptStatus.ENABLED,
    })).rejects.toThrow('同级部门名称已存在')
    expect(transactionalDeptRepository.existsBy).toHaveBeenLastCalledWith(expect.objectContaining({
      name: '研发中心',
      pid: '1',
    }))
  })

  it('updates only the locked department without cascading disabled status', async () => {
    const current = department()
    transactionalDeptRepository.findOne.mockResolvedValueOnce(current)

    await expect(service.update('10', { status: DeptStatus.DISABLED })).resolves.toBe(true)
    expect(current.status).toBe(DeptStatus.DISABLED)
    expect(transactionalDeptRepository.save).toHaveBeenCalledWith(current)
    expect(manager.getRepository).not.toHaveBeenCalledWith(SysUserEntity)
  })

  it('rejects an unknown department and invalid PostgreSQL bigint identity', async () => {
    await expect(service.update('10', { name: '新名称' })).rejects.toThrow(NotFoundException)
    await expect(service.remove('9223372036854775808')).rejects.toThrow(UnprocessableEntityException)
  })

  it('protects departments referenced by children or any persisted user', async () => {
    transactionalDeptRepository.findOne.mockResolvedValue(department())
    transactionalDeptRepository.existsBy.mockResolvedValueOnce(true)
    await expect(service.remove('10')).rejects.toThrow('部门仍有子部门')

    transactionalDeptRepository.existsBy.mockResolvedValueOnce(false)
    userReferenceQueryBuilder.getExists.mockResolvedValueOnce(true)
    await expect(service.remove('10')).rejects.toThrow('部门仍有关联用户')
    expect(userReferenceQueryBuilder.withDeleted).toHaveBeenCalledTimes(1)
  })

  it('soft deletes an unreferenced leaf while preserving bigint string identity', async () => {
    transactionalDeptRepository.findOne.mockResolvedValue(department({ id: '9007199254740993' }))

    await expect(service.remove('9007199254740993')).resolves.toBe(true)
    expect(userReferenceQueryBuilder.where).toHaveBeenCalledWith(
      'user.deptId = :id',
      { id: '9007199254740993' },
    )
    expect(transactionalDeptRepository.softDelete).toHaveBeenCalledWith({ id: '9007199254740993' })
  })

  it('maps unique, foreign-key, and serialization races to conflicts', async () => {
    deptRepository.manager.transaction
      .mockRejectedValueOnce({ code: '23505' })
      .mockRejectedValueOnce({ code: '23503' })
      .mockRejectedValueOnce({ code: '40001' })

    await expect(
      service.create({ name: '研发中心', status: DeptStatus.ENABLED }),
    ).rejects.toThrow('同级部门名称已存在')
    await expect(service.remove('10')).rejects.toThrow('部门关系已发生变化')
    await expect(service.remove('10')).rejects.toThrow(ConflictException)
  })
})
