import type { EntityManager } from 'typeorm'
import type { CreateDictDto, DictListQueryDto, DictResponseDto, UpdateDictDto } from './dto/dict.dto.js'
import { ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { dictTree, flattenDictTree } from './dict-tree.js'
import { assertDictId, buildDictWriteState } from './dict-write.rules.js'
import { DictStatus } from './dict.types.js'
import { SysDictEntity } from './entities/dict.entity.js'

@Injectable()
export class DictService {
  constructor(@InjectRepository(SysDictEntity) private readonly repository: Repository<SysDictEntity>) {}

  async list(query: DictListQueryDto = {}): Promise<DictResponseDto[]> {
    const rows = await this.queryNodes(query)
    let roots = dictTree(rows)
    if ((query.rootId || query.rootCode) && !query.includeSelf)
      roots = roots[0]?.children ?? []
    return query.format === 'flat' ? flattenDictTree(roots) : roots
  }

  async detail(id: string): Promise<DictResponseDto> {
    return (await this.queryNodes({ rootId: id }, true))[0]
  }

  async create(dto: CreateDictDto, actorId: string): Promise<DictResponseDto> {
    return this.write(async (manager) => {
      const state = buildDictWriteState(dto)
      await this.validateParent(manager, state.pid)
      const repository = manager.getRepository(SysDictEntity)
      const node = await repository.save(repository.create({ ...state, createdBy: actorId, updatedBy: actorId }))
      return (await this.queryNodes({ rootId: node.id }, true, manager))[0]
    })
  }

  async update(id: string, dto: UpdateDictDto, actorId: string): Promise<boolean> {
    assertDictId(id)
    return this.write(async (manager) => {
      const repository = manager.getRepository(SysDictEntity)
      const current = await repository.findOneBy({ id })
      if (!current)
        throw new NotFoundException('字典节点不存在')
      const state = buildDictWriteState(dto, current)
      await this.validateParent(manager, state.pid, id)
      await repository.save(Object.assign(current, state, { updatedBy: actorId }))
      return true
    })
  }

  async remove(id: string, actorId: string): Promise<boolean> {
    assertDictId(id)
    return this.write(async (manager) => {
      const repository = manager.getRepository(SysDictEntity)
      if (!await repository.existsBy({ id }))
        throw new NotFoundException('字典节点不存在')
      if (await repository.existsBy({ pid: id }))
        throw new ConflictException('字典仍有下级节点，请先删除或移动下级')
      await repository.update(id, { updatedBy: actorId })
      await repository.softDelete(id)
      return true
    })
  }

  private async queryNodes(query: DictListQueryDto, onlySelf = false, manager = this.repository.manager): Promise<DictResponseDto[]> {
    if (query.rootId !== undefined && query.rootCode !== undefined)
      throw new UnprocessableEntityException('rootId 和 rootCode 只能指定一个')
    if (query.rootId !== undefined)
      assertDictId(query.rootId)
    if (query.rootCode !== undefined && (typeof query.rootCode !== 'string' || query.rootCode.length > 100 || !/^[a-z][a-z0-9_.-]*$/.test(query.rootCode)))
      throw new UnprocessableEntityException('rootCode 无效')
    const scoped = query.rootId !== undefined || query.rootCode !== undefined
    const anchor = query.rootId !== undefined ? 'd.id = $1::bigint' : 'd.code = $1'
    // 锚点只拼接受控 SQL，节点 ID/编码始终使用绑定参数。
    const upstream = scoped
      ? `ancestors AS (
          SELECT d.id, d.pid, ARRAY[d.id] AS ids, ARRAY[d.name::text] AS names, d.status = 1 AS enabled
          FROM sys_dict d WHERE d.deleted_at IS NULL AND ${anchor}
          UNION ALL
          SELECT p.id, p.pid, ARRAY[p.id] || a.ids, ARRAY[p.name::text] || a.names, a.enabled AND p.status = 1
          FROM sys_dict p JOIN ancestors a ON p.id = a.pid
          WHERE p.deleted_at IS NULL AND NOT p.id = ANY(a.ids)
        ),`
      : ''
    const seed = scoped
      ? `SELECT d.*, a.ids AS path_ids, a.names AS path_names, a.enabled
         FROM sys_dict d CROSS JOIN ancestors a
         WHERE d.deleted_at IS NULL AND ${anchor} AND a.pid IS NULL`
      : `SELECT d.*, ARRAY[d.id] AS path_ids, ARRAY[d.name::text] AS path_names, d.status = 1 AS enabled
         FROM sys_dict d WHERE d.deleted_at IS NULL AND d.pid IS NULL`
    const rows: Array<Omit<DictResponseDto, 'fullPathId' | 'fullPathName' | 'effectiveStatus'> & { enabled: boolean }> = await manager.query(`
      WITH RECURSIVE ${upstream} tree AS (
        ${seed}
        UNION ALL
        SELECT d.*, t.path_ids || d.id, t.path_names || d.name::text, t.enabled AND d.status = 1
        FROM sys_dict d JOIN tree t ON d.pid = t.id
        WHERE d.deleted_at IS NULL AND NOT d.id = ANY(t.path_ids)
          ${onlySelf ? 'AND FALSE' : ''}
          ${query.enabledOnly ? 'AND t.enabled AND d.status = 1' : ''}
      )
      SELECT t.id::text, t.pid::text, t.name, t.code, t.value, t.status, t.order_no AS "order", t.remark,
        t.created_at AS "createTime", t.updated_at AS "updateTime",
        t.path_ids::text[] AS "pathIds", t.path_names AS "pathNames", cardinality(t.path_ids) AS depth, t.enabled,
        EXISTS(SELECT 1 FROM sys_dict c WHERE c.pid = t.id AND c.deleted_at IS NULL) AS "hasChildren"
      FROM tree t`, scoped ? [query.rootId ?? query.rootCode] : [])
    if (scoped && !rows.length)
      throw new NotFoundException('字典节点不存在或祖先路径无效')
    return rows.filter(row => !query.enabledOnly || row.enabled).map(({ enabled, ...row }) => ({
      ...row,
      effectiveStatus: enabled ? DictStatus.ENABLED : DictStatus.DISABLED,
      fullPathId: `/${row.pathIds.join('/')}/`,
      fullPathName: row.pathNames.join(' / '),
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
