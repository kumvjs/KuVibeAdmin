import type { EntityManager, Repository } from 'typeorm'
import type { CreateDictDto, DictResponseDto, DictSubtreeQueryDto, UpdateDictDto } from './dto/dict.dto.js'
import { ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CacheService } from '#/shared/cache/cache.service.js'
import { formatDictRows } from './dict-format.js'
import { assertDictId, buildDictWriteState } from './dict-write.rules.js'
import { dictChainCte, dictChildrenSql, dictColumns, dictDescendantsSql } from './dict.sql.js'
import { DICT_MAX_DEPTH, DICT_MAX_RESULT_NODES } from './dict.types.js'
import { SysDictEntity } from './entities/dict.entity.js'

interface DictReadResult {
  cacheEnabled: boolean
  valid: boolean
  tooDeep: boolean
  rows: DictResponseDto[]
}
const prefix = 'sys:dict:{1}' // tenant_id 仍为预留，当前单租户，不宣称租户隔离。
const adminKey = `${prefix}:admin:list` as CacheKey<DictResponseDto[]>
const childrenKey = (id: string) => `${prefix}:children:${id}:enabled` as CacheKey<DictReadResult>
const descendantsKey = (id: string) => `${prefix}:descendants:${id}:enabled` as CacheKey<DictReadResult>

@Injectable()
export class DictService {
  constructor(
    @InjectRepository(SysDictEntity) private readonly repository: Repository<SysDictEntity>,
    private readonly cache: CacheService,
  ) {}

  /** 仅管理控制器调用：一次 SQL 取完整基础集合，输出在内存转换。 */
  async adminList(format: 'flat' | 'tree' = 'tree'): Promise<DictResponseDto[]> {
    const rows = await this.cache.getOrLoadBestEffort(adminKey, () => this.read(manager => manager.query(`SELECT ${dictColumns('d')}, d.status AS "effectiveStatus" FROM sys_dict d WHERE d.deleted_at IS NULL ORDER BY d.order_no, d.id`)), { ttl: 60, jitter: 10 })
    return formatDictRows(rows, format, true)
  }

  roots(): Promise<DictResponseDto[]> {
    return this.read(manager => manager.query(`SELECT ${dictColumns('d')}, d.status AS "effectiveStatus" FROM sys_dict d WHERE d.pid IS NULL AND d.deleted_at IS NULL ORDER BY d.order_no, d.id`))
  }

  async detail(id: string): Promise<DictResponseDto> {
    assertDictId(id)
    const rows: DictResponseDto[] = await this.read(manager => manager.query(`${dictChainCte}
      SELECT ${dictColumns('a')}, CASE WHEN a.enabled THEN 1 ELSE 0 END AS "effectiveStatus" FROM anchor a WHERE a.valid`, [id]))
    if (!rows.length)
      throw new NotFoundException('字典节点不存在或祖先链异常')
    return rows[0]
  }

  async getChildren(id: string, enabledOnly = false): Promise<DictResponseDto[]> {
    return (await this.load(id, 'children', enabledOnly)).rows
  }

  async getDescendants(id: string, query: DictSubtreeQueryDto = {}): Promise<DictResponseDto[]> {
    const result = await this.load(id, 'descendants', query.enabledOnly === true)
    const rows = query.includeSelf ? result.rows : result.rows.filter(row => row.id !== id)
    return formatDictRows(rows, query.format ?? 'flat')
  }

  /** 热点业务必须显式选择此能力，且 anchor.cache_enabled=true 才回填。 */
  async getCachedChildren(id: string): Promise<DictResponseDto[]> {
    assertDictId(id)
    const result = await this.cache.getOrLoadBestEffort(childrenKey(id), () => this.load(id, 'children', true), { ttl: 60, jitter: 10, cacheIf: value => (value as DictReadResult).cacheEnabled })
    return result.rows
  }

  async getCachedDescendants(id: string, query: DictSubtreeQueryDto = {}): Promise<DictResponseDto[]> {
    assertDictId(id)
    // 缓存固定为有效节点并含自身；includeSelf/format 仅在内存投影，不混用不同筛选结果。
    const result = await this.cache.getOrLoadBestEffort(descendantsKey(id), () => this.load(id, 'descendants', true), { ttl: 60, jitter: 10, cacheIf: value => (value as DictReadResult).cacheEnabled })
    const rows = query.includeSelf ? result.rows : result.rows.filter(row => row.id !== id)
    return formatDictRows(rows, query.format ?? 'flat')
  }

  async create(dto: CreateDictDto, actorId: string): Promise<DictResponseDto> {
    const affected = new Set<string>()
    const id = await this.write(async (manager) => {
      const state = buildDictWriteState(dto)
      const chain = await this.validateParent(manager, state.pid)
      const repo = manager.getRepository(SysDictEntity)
      const node = await repo.save(repo.create({ ...state, status: 1, createdBy: actorId, updatedBy: actorId }))
      for (const anchor of [...chain, node.id]) affected.add(anchor)
      return node.id
    })
    await this.invalidate(affected)
    return this.detail(id)
  }

  async update(id: string, dto: UpdateDictDto, actorId: string): Promise<boolean> {
    return this.change(id, actorId, async (manager, current, affected) => {
      const state = buildDictWriteState(dto, current)
      const chain = await this.validateParent(manager, state.pid, id)
      const moved = current.pid !== state.pid
      if (moved) {
        const subtree = await this.subtreeIds(manager, id)
        const depth: Array<{ height: number }> = await manager.query(`WITH RECURSIVE subtree AS (
          SELECT id, 1 AS height, ARRAY[id] AS visited FROM sys_dict WHERE id=$1::bigint AND deleted_at IS NULL
          UNION ALL SELECT d.id, t.height+1, t.visited || d.id FROM sys_dict d JOIN subtree t ON d.pid=t.id
          WHERE d.deleted_at IS NULL AND NOT d.id=ANY(t.visited) AND t.height <= $2
        ) SELECT max(height)::int AS height FROM subtree`, [id, DICT_MAX_DEPTH])
        if (chain.length + depth[0].height > DICT_MAX_DEPTH)
          throw new ConflictException(`移动后超过 ${DICT_MAX_DEPTH} 层安全上限`)
        for (const anchor of subtree) affected.add(anchor)
      }
      for (const anchor of chain) affected.add(anchor)
      await manager.getRepository(SysDictEntity).save(Object.assign(current, state, { updatedBy: actorId }))
    })
  }

  async setStatus(id: string, status: 0 | 1, actorId: string): Promise<boolean> {
    if (status !== 0 && status !== 1)
      throw new UnprocessableEntityException('status 必须为 0 或 1')
    return this.change(id, actorId, async (manager, current, affected) => {
      for (const anchor of await this.subtreeIds(manager, id)) affected.add(anchor)
      await manager.getRepository(SysDictEntity).save(Object.assign(current, { status, updatedBy: actorId }))
    })
  }

  private async load(id: string, kind: 'children' | 'descendants', enabledOnly: boolean): Promise<DictReadResult> {
    assertDictId(id)
    const rows: DictReadResult[] = await this.read(manager => manager.query(kind === 'children' ? dictChildrenSql : dictDescendantsSql, kind === 'children' ? [id, enabledOnly] : [id, enabledOnly, true]))
    const result = rows[0]
    if (!result)
      throw new NotFoundException('字典节点不存在或祖先链异常')
    if (!result.valid || result.tooDeep)
      throw new ConflictException(`字典结构异常或超过 ${DICT_MAX_DEPTH} 层安全上限`)
    if (result.rows.length > DICT_MAX_RESULT_NODES)
      throw new UnprocessableEntityException(`字典查询超过 ${DICT_MAX_RESULT_NODES} 节点上限，请选择更小范围`)
    return result
  }

  private async change(id: string, actorId: string, operation: (manager: EntityManager, current: SysDictEntity, affected: Set<string>) => Promise<void>): Promise<boolean> {
    assertDictId(id)
    const affected = new Set<string>([id])
    await this.write(async (manager) => {
      const current = await manager.getRepository(SysDictEntity).findOneBy({ id })
      if (!current)
        throw new NotFoundException('字典节点不存在')
      for (const anchor of await this.ancestorIds(manager, id)) affected.add(anchor)
      await operation(manager, current, affected)
    })
    await this.invalidate(affected)
    return true
  }

  private async invalidate(ids: Set<string>): Promise<void> {
    await this.cache.invalidateBestEffort([adminKey, ...[...ids].flatMap(id => [childrenKey(id), descendantsKey(id)])])
  }

  private async ancestorIds(manager: EntityManager, id: string): Promise<string[]> {
    const rows: Array<{ id: string }> = await manager.query(`WITH RECURSIVE chain AS (
      SELECT id, pid FROM sys_dict WHERE id=$1::bigint AND deleted_at IS NULL
      UNION SELECT d.id, d.pid FROM sys_dict d JOIN chain c ON d.id=c.pid WHERE d.deleted_at IS NULL
    ) SELECT id::text FROM chain`, [id])
    return rows.map(row => row.id)
  }

  private async subtreeIds(manager: EntityManager, id: string): Promise<string[]> {
    const rows: Array<{ id: string }> = await manager.query(`WITH RECURSIVE subtree AS (
      SELECT id FROM sys_dict WHERE id=$1::bigint AND deleted_at IS NULL
      UNION SELECT d.id FROM sys_dict d JOIN subtree t ON d.pid=t.id WHERE d.deleted_at IS NULL
    ) SELECT id::text FROM subtree`, [id])
    return rows.map(row => row.id)
  }

  private async validateParent(manager: EntityManager, pid: string | null, editingId?: string): Promise<string[]> {
    if (pid === null)
      return []
    const rows: Array<{ id: string, pid: string | null }> = await manager.query(`WITH RECURSIVE chain AS (
      SELECT id, pid FROM sys_dict WHERE id=$1::bigint AND deleted_at IS NULL
      UNION SELECT d.id, d.pid FROM sys_dict d JOIN chain c ON d.id=c.pid WHERE d.deleted_at IS NULL
    ) SELECT id::text, pid::text FROM chain`, [pid])
    if (!rows.length)
      throw new UnprocessableEntityException('父字典节点不存在')
    if (rows.some(row => row.id === editingId) || !rows.some(row => row.pid === null))
      throw new ConflictException('父子关系不能形成循环')
    if (rows.length >= DICT_MAX_DEPTH)
      throw new ConflictException(`超过 ${DICT_MAX_DEPTH} 层安全上限`)
    return rows.map(row => row.id)
  }

  private async read<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.repository.manager.transaction(async (manager) => {
        await manager.query(`SET LOCAL statement_timeout = '3s'`)
        return operation(manager)
      })
    }
    catch (error) {
      const driver = error as { code?: string, driverError?: { code?: string } }
      if ((driver.code ?? driver.driverError?.code) === '57014')
        throw new UnprocessableEntityException('字典查询超时，请选择更小范围')
      throw error
    }
  }

  private async write<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.repository.manager.transaction('READ COMMITTED', async (manager) => {
        await manager.query(`SET LOCAL statement_timeout = '3s'`)
        await manager.query('SELECT pg_advisory_xact_lock(827412, 1)')
        return operation(manager)
      })
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error
      const driver = error as { code?: string, constraint?: string, driverError?: { code?: string, constraint?: string } }
      const code = driver.code ?? driver.driverError?.code
      if (code === '23505')
        throw new ConflictException((driver.constraint ?? driver.driverError?.constraint) === 'uq_sys_dict_code' ? '字典编码已存在' : '同级字典名称已存在')
      if (code === '23503' || code === '40001' || code === '40P01' || code === '57014')
        throw new ConflictException('字典关系变化或写入超时，请刷新重试')
      throw error
    }
  }
}
