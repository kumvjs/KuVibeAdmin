import type { EntityManager } from 'typeorm'
import type { DictInvalidatePlan, DictPathLoader, DictTreeLoader, DictTreePayload } from './dict-cache.types.js'
import { randomInt } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { CacheService } from '#/shared/cache/cache.service.js'
import {
  DICT_CACHE_SCHEMA_VERSION,
  DICT_CACHE_TREE_TTL_SECONDS,
  dictKeys,
} from './dict-cache.keys.js'

// 单租户语义与 sys_dict.tenant_id 默认值一致；租户只用于键命名空间。
const DICT_TENANT = '1'

/**
 * 一级节点索引：
 * - roots：一级节点 ID，按 order、id 排序，用于全树查询。
 * - versions：一级节点 ID -> 整树版本号；写操作只递增受影响的一级节点。
 * - paths：一级节点 ID -> 自身路径；其余节点路径由 path 键单独缓存。
 */
interface DictCacheIndex {
  revision: number
  roots: string[]
  versions: Record<string, number>
  /** 仅一级节点的路径快照，供排障与索引重建使用；读路径以数据库祖先链为准。 */
  paths?: Record<string, { pathIds: string[], pathNames: string[] }>
}

interface DictRootRef {
  id: string
  name: string
}

type RedisClient = ReturnType<CacheService['getClient']>

/**
 * 写入一级整树：
 * KEYS[1]=索引键，KEYS[2]=待写整树键。
 * 仅当索引版本仍是加载时读到的版本才允许写入，避免节点移动后旧整树覆盖新版本键；返回 1 写入 / 0 放弃。
 */
export const WRITE_DICT_TREE = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then return 0 end
  local index = cjson.decode(raw).value
  local version = index.versions[ARGV[1]]
  if not version or tostring(version) ~= ARGV[2] then return 0 end
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
  return 1
`

/**
 * 写操作提交后的失效：
 * KEYS[1]=索引键。
 * ARGV 每五个一组：「锚点 ID、写入前读到的版本号、写入后的版本号、名称或空串、是否一级节点」。
 * 先在同一个脚本内做乐观锁校验，任一锚点版本已被并发写入者改变时整体放弃，
 * 避免旧快照覆盖并发的失效结果。校验通过后写入新版本号，
 * 并按名称维护路径快照（一级节点写入 paths，新建一级节点登记到 roots；改名为空串时删除）。
 * 返回第一组写入后的版本号，0 表示索引缺失或版本已变化。
 * 索引键不设过期时间；若被人工删除或 Redis 换库导致缺失，同样返回 0，下次读取重建索引。
 */
export const INVALIDATE_DICT_CACHE = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then return 0 end
  local decoded = cjson.decode(raw)
  local index = decoded.value
  local total = #ARGV / 5
  for i = 0, total - 1 do
    local anchorId = ARGV[i * 5 + 1]
    local expected = ARGV[i * 5 + 2]
    local current = index.versions[anchorId]
    if expected == '-' then
      if current ~= nil then return 0 end
    elseif tostring(current) ~= tostring(expected) then
      return 0
    end
  end
  for i = 0, total - 1 do
    local anchorId = ARGV[i * 5 + 1]
    index.versions[anchorId] = tonumber(ARGV[i * 5 + 3])
    local name = ARGV[i * 5 + 4]
    if name ~= '' then
      index.paths[anchorId] = { pathIds = { anchorId }, pathNames = { name } }
    else
      index.paths[anchorId] = nil
    end
    if ARGV[i * 5 + 5] == '1' then
      local known = false
      for j = 1, #index.roots do
        if index.roots[j] == anchorId then known = true end
      end
      if not known then
        table.insert(index.roots, anchorId)
      end
    end
  end
  redis.call('SET', KEYS[1], cjson.encode({ value = index }))
  if total > 0 then
    return tonumber(ARGV[3])
  end
  return 1
`

class RevisionMovedError extends Error {}

// 熔断状态按进程共享：任何一次 Redis 故障都不应在下一个请求重新付出超时代价。
let dictCacheUnavailableUntil = 0

@Injectable()
export class DictCacheService {
  private readonly logger = new Logger(DictCacheService.name)
  private readonly pending = new Map<string, Promise<DictTreePayload>>()

  constructor(private readonly cache: CacheService) {}

  /** 一级节点 ID 列表，用于全树查询；索引未命中或不可用时回源。 */
  async readRoots(manager: EntityManager): Promise<string[]> {
    if (this.degraded())
      return (await this.loadRootRefs(manager)).map(row => row.id)
    try {
      return (await this.readIndex(this.cache.getClient(), manager)).roots
    }
    catch (error) {
      this.markUnavailable(error)
      return (await this.loadRootRefs(manager)).map(row => row.id)
    }
  }

  /** 读取一级节点的完整无限级扁平行；同进程并发只回填一次。 */
  async readTree(rootId: string, loader: DictTreeLoader, manager: EntityManager): Promise<DictTreePayload> {
    const existing = this.pending.get(rootId)
    if (existing)
      return existing
    const task = this.loadTreeWithRetry(rootId, loader, manager)
    this.pending.set(rootId, task)
    try {
      return await task
    }
    finally {
      this.pending.delete(rootId)
    }
  }

  /**
   * 解析任意节点的根路径。
   * 路径是改名/移动后最容易失真的派生数据，这里既不读也不写缓存：
   * 每次都用数据库祖先链重新计算（主键索引驱动、最多访问「层级」行），
   * 读放大的部分交给按一级节点缓存的整树，写操作只需维护整树版本号。
   */
  async readPath(id: string, loader: DictPathLoader, manager: EntityManager): Promise<string[] | null> {
    return loader(manager)
  }

  /** 写操作提交后调用；缓存不可用只降级告警，不影响已提交数据。 */
  async invalidate(plan: DictInvalidatePlan): Promise<void> {
    const roots = [...new Map(plan.bumpedRoots.map(root => [root.id, root])).values()]
    if (!roots.length)
      return
    try {
      const redis = this.cache.getClient()
      // 乐观锁基准只读 Redis 中的当前索引，不重建；索引缺失时脚本自身会放弃并返回 0。
      const index = await this.readRedisIndex(redis)
      const args = roots.flatMap((root) => {
        const current = index?.versions[root.id]
        // 新锚点没有历史版本：乐观锁基准用 '-'，并生成全新版本号，确保不会命中历史遗留键。
        const next = current === undefined ? randomInt(1, 2 ** 48 - 1) : current + 1
        return [root.id, current === undefined ? '-' : current, next, root.renamed ? '' : root.name, root.root ? '1' : '0']
      })
      const processed = await redis.eval(INVALIDATE_DICT_CACHE, 1, dictKeys.index(DICT_TENANT), ...args)
      if (Number(processed) === 0)
        this.logger.warn('字典缓存版本索引缺失或版本已变化，跳过增量失效；下一次读取将重建索引')
    }
    catch (error) {
      this.markUnavailable(error)
      this.logger.error(`字典写入已提交，但缓存失效失败；陈旧整树最多保留 ${DICT_CACHE_TREE_TTL_SECONDS} 秒`, error as Error)
    }
  }

  /** 物理清空字典缓存，仅在索引结构升级或人工排障时使用。 */
  async purge(): Promise<void> {
    await this.cache.delCacheByPrefix(`sys:dict:{${DICT_TENANT}}:`)
  }

  /** 复位进程级熔断状态；仅供测试与人工排障使用，正常请求不调用。 */
  static resetCircuitBreaker(): void {
    dictCacheUnavailableUntil = 0
  }

  private async loadTreeWithRetry(rootId: string, loader: DictTreeLoader, manager: EntityManager): Promise<DictTreePayload> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.loadTree(rootId, loader, manager)
      }
      catch (error) {
        if (!(error instanceof RevisionMovedError))
          throw error
      }
    }
    return this.loadDirect(loader, manager)
  }

  private async loadTree(rootId: string, loader: DictTreeLoader, manager: EntityManager): Promise<DictTreePayload> {
    if (this.degraded())
      return this.loadDirect(loader, manager)
    try {
      const redis = this.cache.getClient()
      const index = await this.readIndex(redis, manager)
      const version = index.versions[rootId]
      if (version === undefined)
        return { rows: [] }
      const raw = await redis.get(dictKeys.tree(DICT_TENANT, rootId, version))
      if (raw) {
        const payload = this.parseTree(raw)
        if (payload)
          return payload
      }
      // 版本可能在读取期间被并发写操作递增，此时回源结果必须按新版本重新回填。
      const current = await this.readRevision(redis, rootId)
      if (current !== null && current !== version)
        throw new RevisionMovedError('字典缓存版本已变化')
      const rows = await loader(manager)
      const written = await redis.eval(
        WRITE_DICT_TREE,
        2,
        dictKeys.index(DICT_TENANT),
        dictKeys.tree(DICT_TENANT, rootId, version),
        rootId,
        String(version),
        JSON.stringify({ schema: DICT_CACHE_SCHEMA_VERSION, rows }),
        this.treeTtl(),
      )
      if (Number(written) !== 1)
        throw new RevisionMovedError('字典缓存已被并发写操作失效')
      return { rows }
    }
    catch (error) {
      if (error instanceof RevisionMovedError)
        throw error
      this.markUnavailable(error)
      return this.loadDirect(loader, manager)
    }
  }

  private async loadDirect(loader: DictTreeLoader, manager: EntityManager): Promise<DictTreePayload> {
    return { rows: await loader(manager) }
  }

  /** 只读 Redis 中的索引；不重建、不访问数据库，供写后失效的乐观锁使用。 */
  private async readRedisIndex(redis: RedisClient): Promise<DictCacheIndex | undefined> {
    const raw = await redis.get(dictKeys.index(DICT_TENANT))
    return raw ? this.parseIndex(raw) : undefined
  }

  private async readIndex(redis: RedisClient, manager: EntityManager): Promise<DictCacheIndex> {
    const index = await this.readRedisIndex(redis)
    if (index)
      return index
    const loaded = await this.loadIndex(manager)
    await this.cache.setCache(dictKeys.index(DICT_TENANT), loaded)
    return loaded
  }

  private async loadIndex(manager: EntityManager): Promise<DictCacheIndex> {
    const roots = await this.loadRootRefs(manager)
    // 索引重建后版本号必须与历史缓存键不同，避免旧版本整树键被复用。
    const revision = randomInt(1, 2 ** 48 - 1)
    return {
      revision,
      roots: roots.map(row => row.id),
      versions: Object.fromEntries(roots.map(row => [row.id, revision])),
      paths: Object.fromEntries(roots.map(row => [row.id, { pathIds: [row.id], pathNames: [row.name] }])),
    }
  }

  private async loadRootRefs(manager: EntityManager): Promise<DictRootRef[]> {
    return manager.query(
      `SELECT d.id::text, d.name FROM sys_dict d WHERE d.deleted_at IS NULL AND d.pid IS NULL ORDER BY d.order_no, d.id`,
    )
  }

  /** 返回指定一级节点当前版本号；索引缺失或节点不是一级节点时返回 null。 */
  private async readRevision(redis: RedisClient, rootId: string): Promise<number | null> {
    const raw = await redis.get(dictKeys.index(DICT_TENANT))
    if (!raw)
      return null
    return this.parseIndex(raw)?.versions[rootId] ?? null
  }

  private parseIndex(raw: string): DictCacheIndex | undefined {
    try {
      const parsed = JSON.parse(raw) as { value?: DictCacheIndex }
      const index = parsed.value
      if (!index || typeof index.revision !== 'number' || !Array.isArray(index.roots)
        || typeof index.versions !== 'object' || index.versions === null
        || typeof index.paths !== 'object' || index.paths === null) {
        return undefined
      }
      if (!index.roots.every(rootId => typeof rootId === 'string' && typeof index.versions[rootId] === 'number'))
        return undefined
      return index
    }
    catch {
      return undefined
    }
  }

  private parseTree(raw: string): DictTreePayload | undefined {
    try {
      const parsed = JSON.parse(raw) as { value?: DictTreePayload }
      const value = parsed.value
      if (!value || !Array.isArray(value.rows))
        return undefined
      return { rows: value.rows }
    }
    catch {
      return undefined
    }
  }

  private treeTtl(): number {
    return DICT_CACHE_TREE_TTL_SECONDS + Math.floor(Math.random() * 600)
  }

  private degraded(): boolean {
    return Date.now() < dictCacheUnavailableUntil
  }

  private markUnavailable(error: unknown): void {
    dictCacheUnavailableUntil = Date.now() + 1000
    this.logger.warn(`字典缓存不可用，本次回源且 1 秒内不再访问缓存: ${error instanceof Error ? error.message : String(error)}`)
  }
}
