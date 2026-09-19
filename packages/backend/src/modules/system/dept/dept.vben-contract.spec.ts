import type { Repository } from 'typeorm'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ResOp } from '#/common/dto/response.dto.js'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import { DeptController } from './dept.controller.js'
import { DeptService } from './dept.service.js'
import { DEPT_PERMISSIONS, DeptStatus } from './dept.types.js'
import { SysDeptEntity } from './entities/dept.entity.js'

function department(input: Partial<SysDeptEntity> & Pick<SysDeptEntity, 'id' | 'name'>): SysDeptEntity {
  return {
    createdAt: new Date('2026-09-08T00:00:00.000Z'),
    order: 0,
    pid: null,
    status: DeptStatus.ENABLED,
    ...input,
  } as SysDeptEntity
}

describe('vben department contract', () => {
  const repository = { find: jest.fn() }
  const service = new DeptService(repository as unknown as Repository<SysDeptEntity>)
  const controller = new DeptController(service)

  beforeEach(() => {
    jest.clearAllMocks()
    repository.find.mockResolvedValue([])
  })

  it('returns all records once in a recursively stable department tree', async () => {
    repository.find.mockResolvedValue([
      department({ id: '11', name: 'Child B', order: 20, pid: '10' }),
      department({ id: '10', name: 'Root', order: 10, remark: 'root' }),
      department({ id: '12', name: 'Child A', order: 10, pid: '10', status: DeptStatus.DISABLED }),
      department({ id: '13', name: 'Orphan', pid: '99' }),
    ])

    await expect(controller.list()).resolves.toEqual([
      expect.objectContaining({ id: '13', name: 'Orphan' }),
      expect.objectContaining({
        children: [
          expect.objectContaining({ id: '12', pid: '10', status: DeptStatus.DISABLED }),
          expect.objectContaining({ id: '11', pid: '10' }),
        ],
        id: '10',
        remark: 'root',
      }),
    ])
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ createdAt: true, order: true, pid: true }),
    }))
  })

  it('breaks corrupt cycles deterministically without cyclic JSON', async () => {
    repository.find.mockResolvedValue([
      department({ id: '2', name: 'Cycle B', order: 20, pid: '1' }),
      department({ id: '1', name: 'Cycle A', order: 10, pid: '2' }),
      department({ id: '3', name: 'Self', pid: '3' }),
    ])

    const result = await service.list()
    expect(result).toHaveLength(2)
    expect(result).toEqual([
      expect.objectContaining({ id: '3' }),
      expect.objectContaining({ children: [expect.objectContaining({ id: '2' })], id: '1' }),
    ])
    expect(JSON.stringify(result).match(/"id":"[1-3]"/g)).toHaveLength(3)
  })

  it('exposes Vben routes with dedicated permissions and boolean envelopes', async () => {
    expect(Reflect.getMetadata(PATH_METADATA, DeptController)).toBe('dept')
    expect(Reflect.getMetadata(PATH_METADATA, DeptController.prototype.list)).toBe('list')
    expect(Reflect.getMetadata(PERMISSION_KEY, DeptController.prototype.list)).toBe(DEPT_PERMISSIONS.LIST)

    for (const [method, path, permission] of [
      ['create', '/', DEPT_PERMISSIONS.CREATE],
      ['update', ':id', DEPT_PERMISSIONS.UPDATE],
      ['remove', ':id', DEPT_PERMISSIONS.DELETE],
    ] as const) {
      expect(Reflect.getMetadata(PATH_METADATA, DeptController.prototype[method])).toBe(path)
      expect(Reflect.getMetadata(PERMISSION_KEY, DeptController.prototype[method])).toBe(permission)
    }
    expect(ResOp.success(true)).toMatchObject({ code: 0, data: true, success: true })
  })

  it('delegates write DTOs without changing their values', async () => {
    const create = jest.spyOn(service, 'create').mockResolvedValueOnce(true)
    const update = jest.spyOn(service, 'update').mockResolvedValueOnce(true)
    const remove = jest.spyOn(service, 'remove').mockResolvedValueOnce(true)
    const dto = { name: '研发中心', order: 10, status: DeptStatus.ENABLED }

    await expect(controller.create(dto)).resolves.toBe(true)
    await expect(controller.update({ id: '7' }, { status: DeptStatus.DISABLED })).resolves.toBe(true)
    await expect(controller.remove({ id: '7' })).resolves.toBe(true)
    expect(create).toHaveBeenCalledWith(dto)
    expect(update).toHaveBeenCalledWith('7', { status: DeptStatus.DISABLED })
    expect(remove).toHaveBeenCalledWith('7')
  })
})
