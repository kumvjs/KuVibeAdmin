import type { EntityManager } from 'typeorm'
import type { CacheService } from '#/shared/cache/cache.service.js'
import type { DictCacheRow, DictPathLoader } from './dict-cache.types.js'
import { dictKeys } from './dict-cache.keys.js'
import { DictCacheService } from './dict-cache.service.js'

interface FakeRedis {
  data: Map<string, string>
  mode: 'ok' | 'down'
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ...rest: unknown[]) => Promise<'OK'>
  del: (...keys: string[]) => Promise<number>
  eval: (script: string, count: number, ...rest: unknown[]) => Promise<unknown>
}

/** 只实现字典缓存用到的命令；Lua 用真实原因分支模拟，避免测试依赖真实 Redis。 */
function fakeRedis(): FakeRedis {
  const data = new Map<string, string>()
  const assertUp = (redis: FakeRedis) => {
    if (redis.mode === 'down')
      throw new Error('redis down')
  }
  const redis: FakeRedis = {
    data,
    mode: 'ok',
    async get(key) {
      assertUp(redis)
      return data.get(key) ?? null
    },
    async set(key, value) {
      assertUp(redis)
      data.set(key, value)
      return 'OK'
    },
    async del(...keys) {
      assertUp(redis)
      let removed = 0
      for (const key of keys)
        removed += data.delete(key) ? 1 : 0
      return removed
    },
    async eval(script, count, ...rest) {
      assertUp(redis)
      const keys = rest.slice(0, count).map(String)
      const argv = rest.slice(count)
      const indexKey = keys[0]
      const raw = data.get(indexKey)
      // 失效脚本写 index 键，整树回填脚本只做带版本校验的 SET。
      if (script.includes('index.paths')) {
        if (!raw)
          return 0
        const index = JSON.parse(raw) as { value: { versions: Record<string, number>, paths: Record<string, unknown>, roots: string[] } }
        // 与真实脚本一致：先按乐观锁校验，再删除路径键、写入新版本号并维护锚点路径快照。
        for (let cursor = 0; cursor + 4 < argv.length; cursor += 5) {
          const expected = String(argv[cursor + 1])
          const current = index.value.versions[String(argv[cursor])]
          if (expected === '-') {
            if (current !== undefined)
              return 0
          }
          else if (String(current) !== expected) {
            return 0
          }
        }
        for (const key of keys.slice(1))
          data.delete(key)
        for (let cursor = 0; cursor + 4 < argv.length; cursor += 5) {
          const anchorId = String(argv[cursor])
          index.value.versions[anchorId] = Number(argv[cursor + 2])
          const name = String(argv[cursor + 3])
          if (name)
            index.value.paths[anchorId] = { pathIds: [anchorId], pathNames: [name] }
          else
            delete index.value.paths[anchorId]
          if (String(argv[cursor + 4]) === '1' && !index.value.roots.includes(anchorId))
            index.value.roots.push(anchorId)
        }
        data.set(indexKey, JSON.stringify(index))
        return argv.length >= 5 ? Number(argv[2]) : 1
      }
      if (!raw)
        return 0
      const index = JSON.parse(raw) as { value: { versions: Record<string, number> } }
      if (String(index.value.versions[String(argv[0])]) !== String(argv[1]))
        return 0
      // 与 CacheService 一致，缓存值统一包装为 { value }。
      data.set(keys[1], JSON.stringify({ value: JSON.parse(String(argv[2])) }))
      return 1
    },
  }
  return redis
}

function row(id: string, pathIds: string[], extra: Partial<DictCacheRow> = {}): DictCacheRow {
  return {
    id,
    pid: null,
    name: `节点${id}`,
    code: `test.node_${id}`,
    value: null,
    status: 1,
    order: 0,
    remark: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    pathIds,
    pathNames: pathIds.map(item => `节点${item}`),
    ...extra,
  }
}

// 一级节点查询与 readPath 回退都会直接查库；计数用于断言缓存命中时没有真实数据库访问。
const queryCalls = { count: 0 }
const manager = {
  query: () => {
    queryCalls.count++
    return Promise.resolve([{ id: '1', name: '节点1' }, { id: '7', name: '节点7' }, { id: '9', name: '节点9' }])
  },
} as unknown as EntityManager

function build(payload: Partial<DictCacheRow> & { id: string, pid: string | null }, pathIds: string[]): DictCacheRow {
  return row(payload.id, pathIds, payload)
}

function createCache(redis: FakeRedis) {
  const cache = {
    getClient: () => redis,
    // 与 CacheService 一致：JSON 包装为 { value }，并让出事件循环模拟真实异步写入。
    setCache: async (key: string, value: unknown) => {
      await Promise.resolve()
      redis.data.set(key, JSON.stringify({ value }))
    },
    delCache: (key: string) => redis.del(key),
    delCacheByPrefix: async () => {},
  }
  return new DictCacheService(cache as unknown as CacheService)
}

describe('字典一级整树缓存', () => {
  // 熔断状态按进程共享，用例之间必须显式复位，避免降级用例影响后续断言。
  beforeEach(() => DictCacheService.resetCircuitBreaker())

  it('整树缓存命中后不再回源，写操作只递增受影响一级节点版本', async () => {
    const redis = fakeRedis()
    const cache = createCache(redis)
    const tree = [row('1', ['1']), row('2', ['1', '2'], { pid: '1' })]
    let treeQueries = 0
    const readTree = () => cache.readTree('1', () => {
      treeQueries++
      return Promise.resolve(tree)
    }, manager)

    queryCalls.count = 0
    expect(await cache.readRoots(manager)).toEqual(['1', '7', '9'])
    expect((await readTree()).rows.map(item => item.id)).toEqual(['1', '2'])
    expect(await cache.readRoots(manager)).toEqual(['1', '7', '9'])
    expect((await readTree()).rows.map(item => item.id)).toEqual(['1', '2'])
    // 索引与整树都命中缓存：没有一级节点查询，也没有整树回源。
    expect({ queryCount: queryCalls.count, treeQueries }).toEqual({ queryCount: 1, treeQueries: 1 })

    // 只递增 1 号一级节点：旧版本键不可达，下一次读取必须回源。
    await cache.invalidate({ bumpedRoots: [{ id: '1', name: '节点1', renamed: false, root: true }] })
    await readTree()
    expect(treeQueries).toBe(2)
  })

  it('读取期间版本被并发写操作递增时重新回源，不回填陈旧版本键', async () => {
    const redis = fakeRedis()
    const cache = createCache(redis)
    await cache.readRoots(manager)
    let treeQueries = 0
    const payload = await cache.readTree('1', async () => {
      treeQueries++
      // 模拟回源期间管理员写入：版本递增后加载结果必须按新版本重试。
      if (treeQueries === 1)
        await cache.invalidate({ bumpedRoots: [{ id: '1', name: '节点1', renamed: false, root: true }] })
      return [row('1', ['1'])]
    }, manager)
    expect(treeQueries).toBe(2)
    expect(payload.rows.map(item => item.id)).toEqual(['1'])
  })

  it('索引重建产生全新版本号，避免复用旧版本路径键', async () => {
    const redis = fakeRedis()
    const cache = createCache(redis)
    const indexKey = dictKeys.index('1')
    await cache.readRoots(manager)
    const first = JSON.parse(redis.data.get(indexKey)!) as { value: { revision: number } }
    redis.data.delete(indexKey)
    await cache.readRoots(manager)
    const second = JSON.parse(redis.data.get(indexKey)!) as { value: { revision: number } }
    expect(second.value.revision).not.toBe(first.value.revision)
  })

  it('路径解析始终以数据库祖先链为准，不缓存派生路径', async () => {
    const cache = createCache(fakeRedis())
    await cache.readRoots(manager)
    let pathQueries = 0
    const loader: DictPathLoader = () => {
      pathQueries++
      return Promise.resolve(['1', '2', '3'])
    }
    expect(await cache.readPath('3', loader, manager)).toEqual(['1', '2', '3'])
    expect(await cache.readPath('3', loader, manager)).toEqual(['1', '2', '3'])
    // 改名或移动后旧路径必须立即失效，因此每次都回源。
    expect(pathQueries).toBe(2)
  })

  it('尚未建立索引时也能读取一级节点路径', async () => {
    const redis = fakeRedis()
    const cache = createCache(redis)
    expect(await cache.readPath('7', () => Promise.resolve(['7']), manager)).toEqual(['7'])
  })

  it('组装范围时裁剪停用分支并保留 hasChildren 语义', async () => {
    const rows: DictCacheRow[] = [
      build({ id: '1', pid: null }, ['1']),
      build({ id: '2', pid: '1', status: 0 }, ['1', '2']),
      build({ id: '3', pid: '2' }, ['1', '2', '3']),
      build({ id: '4', pid: '1', status: 0 }, ['1', '4']),
    ]
    const cache = createCache(fakeRedis())
    const { buildDictScope } = await import('./dict-tree.js')
    const scoped = buildDictScope(rows, '2', true, true)
    expect(scoped.rows.map(item => item.id)).toEqual([])
    const full = buildDictScope(rows, null, true, true)
    expect(full.rows.map(item => item.id)).toEqual(['1'])
    expect(full.childrenOf.get('1')?.map(item => item.id)).toEqual(['2', '4'])
    expect(full.childrenOf.get('2')?.map(item => item.id)).toEqual(['3'])
    expect(full.childrenOf.get('3')).toBeUndefined()
  })
})
