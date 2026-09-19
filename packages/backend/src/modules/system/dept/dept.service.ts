import type { EntityManager } from 'typeorm'
import type { CreateDeptDto } from './dto/create-dept.dto.js'
import type { DeptResponseDto } from './dto/dept-response.dto.js'
import type { UpdateDeptDto } from './dto/update-dept.dto.js'
import { ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { assertDeptId, buildDeptWriteState } from './dept-write.rules.js'
import { SysDeptEntity } from './entities/dept.entity.js'

@Injectable()
export class DeptService {
  constructor(
    @InjectRepository(SysDeptEntity)
    private readonly deptRepository: Repository<SysDeptEntity>,
  ) {}

  async list(): Promise<DeptResponseDto[]> {
    const departments = await this.deptRepository.find({
      select: {
        createdAt: true,
        id: true,
        name: true,
        order: true,
        pid: true,
        remark: true,
        status: true,
      },
    })

    return this.buildTree(departments)
  }

  async create(dto: CreateDeptDto): Promise<boolean> {
    return this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysDeptEntity)
      const state = buildDeptWriteState(dto)

      await this.validateWriteState(repository, state)
      await repository.save(repository.create(state))
      return true
    })
  }

  async update(id: string, dto: UpdateDeptDto): Promise<boolean> {
    assertDeptId(id)

    return this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysDeptEntity)
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id },
      })
      if (!current)
        throw new NotFoundException('部门不存在')

      const state = buildDeptWriteState(dto, current)
      await this.validateWriteState(repository, state, id)
      Object.assign(current, state)
      await repository.save(current)
      return true
    })
  }

  async remove(id: string): Promise<boolean> {
    assertDeptId(id)

    return this.runSerializableWrite(async (manager) => {
      const repository = manager.getRepository(SysDeptEntity)
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        select: { id: true },
        where: { id },
      })
      if (!current)
        throw new NotFoundException('部门不存在')
      if (await repository.existsBy({ pid: id }))
        throw new ConflictException('部门仍有子部门，不能删除')

      const userExists = await manager
        .getRepository(SysUserEntity)
        .createQueryBuilder('user')
        .withDeleted()
        .where('user.deptId = :id', { id })
        .getExists()
      if (userExists)
        throw new ConflictException('部门仍有关联用户，不能删除')

      const result = await repository.softDelete({ id })
      if (result.affected !== 1)
        throw new ConflictException('部门删除失败，请刷新后重试')
      return true
    })
  }

  private async validateWriteState(
    repository: Repository<SysDeptEntity>,
    state: ReturnType<typeof buildDeptWriteState>,
    editingId?: string,
  ): Promise<void> {
    await this.validateParentChain(repository, state.pid, editingId)

    const id = editingId ? Not(editingId) : undefined
    const duplicate = state.pid
      ? await repository.existsBy({ ...(id && { id }), name: state.name, pid: state.pid })
      : await repository.existsBy({ ...(id && { id }), name: state.name, pid: IsNull() })
    if (duplicate)
      throw new ConflictException('同级部门名称已存在')
  }

  private async validateParentChain(
    repository: Repository<SysDeptEntity>,
    parentId: string | null,
    editingId?: string,
  ): Promise<void> {
    if (!parentId)
      return

    const visitedIds = new Set<string>(editingId ? [editingId] : [])
    let currentId: string | null = parentId

    while (currentId) {
      if (visitedIds.has(currentId))
        throw new ConflictException('父子关系不能形成循环')
      visitedIds.add(currentId)

      const parent: Pick<SysDeptEntity, 'id' | 'pid'> | null = await repository.findOne({
        lock: { mode: 'pessimistic_read' },
        select: { id: true, pid: true },
        where: { id: currentId },
      })
      if (!parent)
        throw new UnprocessableEntityException('父部门不存在')
      currentId = parent.pid ? String(parent.pid) : null
    }
  }

  private async runSerializableWrite<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.deptRepository.manager.transaction('SERIALIZABLE', operation)
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error

      const driverError = error as { code?: string, driverError?: { code?: string } }
      const code = driverError.code ?? driverError.driverError?.code
      if (code === '23505')
        throw new ConflictException('同级部门名称已存在')
      if (code === '23503')
        throw new ConflictException('部门关系已发生变化，请刷新后重试')
      if (code === '40001' || code === '40P01')
        throw new ConflictException('部门已被并发修改，请刷新后重试')

      throw error
    }
  }

  private buildTree(departments: SysDeptEntity[]): DeptResponseDto[] {
    const departmentById = new Map(departments.map(dept => [String(dept.id), dept]))
    const normalizedParentIds = new Map<string, string | null>()

    for (const department of departments) {
      const id = String(department.id)
      const parentId = department.pid ? String(department.pid) : null
      normalizedParentIds.set(
        id,
        parentId && parentId !== id && departmentById.has(parentId) ? parentId : null,
      )
    }

    const completedIds = new Set<string>()
    for (const startId of departmentById.keys()) {
      if (completedIds.has(startId))
        continue

      const path: string[] = []
      const pathPositions = new Map<string, number>()
      let currentId: string | null = startId
      while (currentId && !completedIds.has(currentId)) {
        const cycleStart = pathPositions.get(currentId)
        if (cycleStart !== undefined) {
          const cycleIds = path.slice(cycleStart)
          const anchorId = [...cycleIds].sort((leftId, rightId) => (
            this.compareDepartments(departmentById.get(leftId)!, departmentById.get(rightId)!)
          ))[0]
          normalizedParentIds.set(anchorId, null)
          break
        }
        pathPositions.set(currentId, path.length)
        path.push(currentId)
        currentId = normalizedParentIds.get(currentId) ?? null
      }
      for (const id of path)
        completedIds.add(id)
    }

    const nodeById = new Map<string, DeptResponseDto>()
    for (const department of departments) {
      const id = String(department.id)
      const parentId = normalizedParentIds.get(id) ?? null
      const node: DeptResponseDto = {
        createTime: department.createdAt,
        id,
        name: department.name,
        order: department.order,
        status: department.status,
      }
      if (parentId)
        node.pid = parentId
      if (department.remark)
        node.remark = department.remark
      nodeById.set(id, node)
    }

    const roots: DeptResponseDto[] = []
    for (const [id, node] of nodeById) {
      const parentId = normalizedParentIds.get(id)
      const parent = parentId ? nodeById.get(parentId) : undefined
      if (parent)
        (parent.children ??= []).push(node)
      else
        roots.push(node)
    }

    this.sortTree(roots)
    return roots
  }

  private sortTree(departments: DeptResponseDto[]): void {
    departments.sort((left, right) => this.compareDepartments(left, right))
    for (const department of departments) {
      if (department.children)
        this.sortTree(department.children)
    }
  }

  private compareDepartments(
    left: Pick<SysDeptEntity, 'id' | 'name' | 'order'>,
    right: Pick<SysDeptEntity, 'id' | 'name' | 'order'>,
  ): number {
    if (left.order !== right.order)
      return left.order - right.order
    if (left.name !== right.name)
      return left.name < right.name ? -1 : 1
    const leftId = BigInt(String(left.id))
    const rightId = BigInt(String(right.id))
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
  }
}
