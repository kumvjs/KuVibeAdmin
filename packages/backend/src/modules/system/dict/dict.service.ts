import type { EntityManager, Repository } from 'typeorm'
import type { DictCacheRow, DictInvalidatePlan } from './dict-cache.types.js'
import type { DictTreeBuild, DictTreeRow } from './dict-tree.js'
import type { CreateDictDto, DictListQueryDto, DictResponseDto, UpdateDictDto } from './dto/dict.dto.js'
import { ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DictCacheService } from './dict-cache.service.js'
import { buildDictScope, flattenScopedRows } from './dict-tree.js'
import { assertDictId, buildDictWriteState } from './dict-write.rules.js'
import { dictAncestorPathSql, dictTreeRowsSql } from './dict.sql.js'
import { DictStatus } from './dict.types.js'
import { SysDictEntity } from './entities/dict.entity.js'

/** 读接口的最小查询形状，兼容控制器 DTO 与内部定点查询。 */
interface DictScopeQuery {
  rootId?: string
  rootCode?: string
  includeSelf?: boolean
  enabledOnly?: boolean
}

@Injectable()
export class DictService {
  constructor(
    @InjectRepository(SysDictEntity) private readonly repository: Repository<SysDictEntity>,
    private readonly cache: DictCacheService,
  ) {}

  /**
   * 全树或任意节点的全部层级下级。
   * 一级节点整树常驻缓存，范围裁剪、停用过滤与树/扁平输出全部在内存完成。
   */
  async list(query: DictListQueryDto = {}): Promise<DictResponseDto[]> {
    const build = await this.queryNodes(query, this.repository.manager)
    if (query.format === 'flat')
      return flattenScopedRows(build).map(row => this.toResponse(row, build))
    const scoped = query.rootId !== undefined || query.rootCode !== undefined
    if (scoped && !query.includeSelf)
      return (build.childrenOf.get(build.scopeRootId ?? '') ?? []).map(row => this.toTree(row, build))
    if (scoped)
      return build.rows.length ? [this.toTree(build.rows[0], build)] : []
    return (build.childrenOf.get('') ?? []).map(row => this.toTree(row, build))
  }

  async detail(id: string): Promise<DictResponseDto> {
    assertDictId(id)
    // 读接口统一按一级节点整树取值：detail 承载完整路径，缓存单元与列表接口保持一致。
    const { row, tree } = await this.resolveNode(id, this.repository.manager)
    // 单节点查询不带 children，但 hasChildren 与有效状态必须反映完整祖先链，不能只看自身。
    const hasChildren = tree.some(item => item.pid === id)
    const enabled = this.resolveEffectiveStatus(tree, row) === DictStatus.ENABLED
    return { ...this.toResponse({ ...row, depth: row.pathIds.length, enabled }, null), hasChildren }
  }

  async create(dto: CreateDictDto, actorId: string): Promise<DictResponseDto> {
    const invalidate: DictInvalidatePlan = { bumpedRoots: [] }
    const nodeId = await this.write(async (manager) => {
      const state = buildDictWriteState(dto)
      await this.validateParent(manager, state.pid)
      const repository = manager.getRepository(SysDictEntity)
      const node = await repository.save(repository.create({ ...state, createdBy: actorId, updatedBy: actorId }))
      const parentPath = state.pid === null ? [] : await this.resolvePath(state.pid, manager) ?? []
      // 新增节点会改变其全部祖先锚点的范围树，因此祖先链每一层都要失效。
      const affectedAnchors = state.pid === null ? [node.id] : [...parentPath]
      for (const anchorId of affectedAnchors) {
        invalidate.bumpedRoots.push({
          id: anchorId,
          name: anchorId === node.id ? state.name : await this.loadNodeName(manager, anchorId),
          renamed: false,
          root: anchorId === node.id ? state.pid === null : anchorId === parentPath[0],
        })
      }
      return node.id
    })
    await this.cache.invalidate(invalidate)
    return this.detail(nodeId)
  }

  async update(id: string, dto: UpdateDictDto, actorId: string): Promise<boolean> {
    assertDictId(id)
    const invalidate: DictInvalidatePlan = { bumpedRoots: [] }
    await this.write(async (manager) => {
      const repository = manager.getRepository(SysDictEntity)
      const current = await repository.findOneBy({ id })
      if (!current)
        throw new NotFoundException('字典节点不存在')
      const previousPath = await this.resolvePath(id, manager) ?? []
      const state = buildDictWriteState(dto, current)
      await this.validateParent(manager, state.pid, id)
      await repository.save(Object.assign(current, state, { updatedBy: actorId }))
      const nextPath = state.pid === null ? [id] : [...await this.resolvePath(state.pid, manager) ?? [], id]
      const moved = current.pid !== state.pid
      const renamed = current.name !== state.name
      for (const anchorId of new Set([...previousPath, ...nextPath])) {
        // 节点自身改名时，索引里缓存的名称已过期，必须让下次读取回源重算。
        const isRenamedAnchor = renamed && anchorId === id
        invalidate.bumpedRoots.push({
          id: anchorId,
          name: isRenamedAnchor ? '' : await this.loadNodeName(manager, anchorId),
          renamed: isRenamedAnchor,
          root: anchorId === current.pid || anchorId === state.pid,
        })
      }
      // 改名、移动或状态变化都会让整棵范围树的 effectiveStatus / 路径失效，
      // 由上面的 bumpedRoots 递增祖先链版本号覆盖，无需再逐节点清理路径键。
      void moved
      void renamed
      return true
    })
    await this.cache.invalidate(invalidate)
    return true
  }

  async remove(id: string, actorId: string): Promise<boolean> {
    assertDictId(id)
    const invalidate: DictInvalidatePlan = { bumpedRoots: [] }
    await this.write(async (manager) => {
      const repository = manager.getRepository(SysDictEntity)
      if (!await repository.existsBy({ id }))
        throw new NotFoundException('字典节点不存在')
      if (await repository.existsBy({ pid: id }))
        throw new ConflictException('字典仍有下级节点，请先删除或移动下级')
      const path = await this.resolvePath(id, manager) ?? []
      // 软删除后该行对 loadNodeName 不可见，必须先取名称再删除。
      const anchorNames = new Map<string, string>()
      for (const anchorId of path)
        anchorNames.set(anchorId, await this.loadNodeName(manager, anchorId))
      await repository.update(id, { updatedBy: actorId })
      await repository.softDelete(id)
      for (const anchorId of path) {
        invalidate.bumpedRoots.push({
          id: anchorId,
          name: anchorNames.get(anchorId)!,
          renamed: false,
          root: anchorId === path[0],
        })
      }
      return true
    })
    await this.cache.invalidate(invalidate)
    return true
  }

  /** 组装指定范围的子树；整树只回源一次，其余全部在内存完成。 */
  private async queryNodes(
    query: DictScopeQuery,
    manager: EntityManager = this.repository.manager,
  ): Promise<DictTreeBuild> {
    if (query.rootId !== undefined && query.rootCode !== undefined)
      throw new UnprocessableEntityException('rootId 和 rootCode 只能指定一个')
    if (query.rootId !== undefined)
      assertDictId(query.rootId)
    if (query.rootCode !== undefined && (typeof query.rootCode !== 'string' || query.rootCode.length > 100 || !/^[a-z][a-z0-9_.-]*$/.test(query.rootCode)))
      throw new UnprocessableEntityException('rootCode 无效')
    const scoped = query.rootId !== undefined || query.rootCode !== undefined
    if (scoped) {
      // 范围根是锚点自身；整树按一级节点缓存，任意层级锚点都复用同一份数据。
      const scopeRootId = query.rootId ?? await this.resolveNodeId(query.rootCode!, manager)
      const rows = await this.resolveSubtree(scopeRootId, manager)
      return buildDictScope(rows, scopeRootId, query.includeSelf === true, query.enabledOnly === true, rows)
    }
    const rootIds = await this.cache.readRoots(manager)
    const payloads = await Promise.all(rootIds.map(rootId =>
      this.cache.readTree(rootId, entityManager => this.loadTreeRows(entityManager, rootId), manager),
    ))
    const rows = payloads.flatMap(payload => payload.rows)
    return buildDictScope(rows, null, query.includeSelf === true, query.enabledOnly === true, rows)
  }

  /**
   * 读取锚点所在的一级整树（含范围根的祖先行）。
   * 保留祖先行有两个原因：范围根本身可能有停用祖先（effectiveStatus 需要），
   * 以及命中一级节点缓存后任意层级锚点都复用同一份数据，无需为每层各存一份。
   */
  private async resolveSubtree(anchorId: string, manager: EntityManager): Promise<DictCacheRow[]> {
    const path = await this.resolvePath(anchorId, manager)
    if (!path)
      throw new NotFoundException('字典节点不存在或祖先路径无效')
    const payload = await this.cache.readTree(path[0], entityManager => this.loadTreeRows(entityManager, path[0]), manager)
    return payload.rows
  }

  /** 同时返回节点所在的一级整树与节点自身，供 detail 与 hasChildren 共用一次缓存读取。 */
  private async resolveNode(id: string, manager: EntityManager): Promise<{ row: DictCacheRow, tree: DictCacheRow[] }> {
    const path = await this.resolvePath(id, manager)
    if (!path)
      throw new NotFoundException('字典节点不存在或祖先路径无效')
    const payload = await this.cache.readTree(path[0], entityManager => this.loadTreeRows(entityManager, path[0]), manager)
    const row = payload.rows.find(item => item.id === id)
    if (!row)
      throw new NotFoundException('字典节点不存在或祖先路径无效')
    return { row, tree: payload.rows }
  }

  /** 沿 ancestors 字段判断自身及全部祖先是否启用；只依赖本次已取回的一级整树。 */
  private resolveEffectiveStatus(tree: DictCacheRow[], row: DictCacheRow): DictStatus {
    const byId = new Map(tree.map(item => [item.id, item]))
    let current: DictCacheRow | undefined = row
    while (current) {
      if (current.status !== DictStatus.ENABLED)
        return DictStatus.DISABLED
      current = current.pid === null ? undefined : byId.get(current.pid)
    }
    return DictStatus.ENABLED
  }

  /** 取一级节点名称用于重建索引中的路径快照；节点已在同一事务内存在。 */
  private async loadNodeName(manager: EntityManager, id: string): Promise<string> {
    const rows: Array<{ name: string }> = await manager.query(
      `SELECT d.name FROM sys_dict d WHERE d.id = $1::bigint AND d.deleted_at IS NULL`,
      [id],
    )
    if (!rows.length)
      throw new NotFoundException('字典节点不存在或祖先路径无效')
    return rows[0].name
  }

  /** 用全局唯一编码定位节点；编码是唯一索引，不存在时直接拒绝。 */
  private async resolveNodeId(code: string, manager: EntityManager): Promise<string> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT d.id::text FROM sys_dict d WHERE d.code = $1 AND d.deleted_at IS NULL`,
      [code],
    )
    if (!rows.length)
      throw new NotFoundException('字典节点不存在或祖先路径无效')
    return rows[0].id
  }

  private async resolvePath(id: string, manager: EntityManager = this.repository.manager): Promise<string[] | null> {
    return this.cache.readPath(id, entityManager => this.loadAncestorPath(entityManager, id), manager)
  }

  /**
   * 向上追溯祖先路径，返回从一级节点到自身的 ID 序列。
   * 任一层缺失返回空数组：节点已删除或祖先链断裂都按不存在处理。
   */
  private async loadAncestorPath(manager: EntityManager, id: string): Promise<string[] | null> {
    const rows: Array<{ id: string, pid: string | null }> = await manager.query(dictAncestorPathSql, [id])
    if (!rows.length || rows[0].pid !== null)
      return null
    return rows.map(row => row.id)
  }

  /** 单次查询取一级节点的完整无限级子树；仅在缓存未命中时执行。 */
  private async loadTreeRows(manager: EntityManager, rootId: string): Promise<DictCacheRow[]> {
    const rows: Array<Omit<DictCacheRow, 'createTime' | 'updateTime'> & { createTime: Date | string, updateTime: Date | string }>
      = await manager.query(dictTreeRowsSql, [rootId])
    return rows.map(row => ({
      ...row,
      createTime: row.createTime instanceof Date ? row.createTime : new Date(row.createTime),
      updateTime: row.updateTime instanceof Date ? row.updateTime : new Date(row.updateTime),
    }))
  }

  private async validateParent(manager: EntityManager, pid: string | null, editingId?: string): Promise<void> {
    if (pid === null)
      return
    const chain: Array<{ id: string, pid: string | null }> = await manager.query(`
      WITH RECURSIVE chain AS (
        SELECT id, pid FROM sys_dict WHERE id = $1::bigint AND deleted_at IS NULL
        UNION
        SELECT p.id, p.pid FROM sys_dict p JOIN chain c ON p.id = c.pid WHERE p.deleted_at IS NULL
      ) SELECT id::text, pid::text FROM chain`, [pid])
    if (!chain.length)
      throw new UnprocessableEntityException('父字典节点不存在')
    if (chain.some(node => node.id === editingId) || !chain.some(node => node.pid === null))
      throw new ConflictException('父子关系不能形成循环，祖先节点必须有效')
  }

  private toResponse(row: DictTreeRow, build: DictTreeBuild | null): DictResponseDto {
    return {
      id: row.id,
      pid: row.pid,
      name: row.name,
      code: row.code,
      value: row.value,
      status: row.status,
      effectiveStatus: row.enabled ? DictStatus.ENABLED : DictStatus.DISABLED,
      order: row.order,
      remark: row.remark,
      createTime: row.createTime,
      updateTime: row.updateTime,
      fullPathId: `/${row.pathIds.join('/')}/`,
      fullPathName: row.pathNames.join(' / '),
      pathIds: row.pathIds,
      pathNames: row.pathNames,
      depth: row.pathIds.length,
      hasChildren: (build?.childrenOf.get(row.id)?.length ?? 0) > 0,
    }
  }

  private toTree(row: DictTreeRow, build: DictTreeBuild): DictResponseDto {
    const accepted = new Set(build.rows.map(item => item.id))
    const children = (build.childrenOf.get(row.id) ?? []).filter(child => accepted.has(child.id))
    const node = this.toResponse(row, build)
    return children.length ? { ...node, children: children.map(child => this.toTree(child, build)) } : node
  }

  private async write<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.repository.manager.transaction('READ COMMITTED', async (manager) => {
        // 本模块所有写操作先获取同一事务锁；锁后语句使用最新快照再检查祖先/下级。
        await manager.query('SELECT pg_advisory_xact_lock(827412, 1)')
        return operation(manager)
      })
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error
      const driver = error as { code?: string, constraint?: string, driverError?: { code?: string, constraint?: string } }
      const code = driver.code ?? driver.driverError?.code
      if (code === '23505') {
        const constraint = driver.constraint ?? driver.driverError?.constraint
        throw new ConflictException(constraint === 'uq_sys_dict_code' ? '字典编码已存在' : '同级字典名称已存在')
      }
      if (code === '23503' || code === '40001' || code === '40P01')
        throw new ConflictException('字典关系已发生变化，请刷新后重试')
      throw error
    }
  }
}
