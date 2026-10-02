// 字典缓存键：读多写少场景下按一级节点缓存完整无限级子树。
// tenant 只作为键命名空间，当前单租户语义与 sys_dict.tenant_id 默认值一致。

export const DICT_CACHE_SCHEMA_VERSION = 1 as const

// 整树缓存的物理兜底过期；逻辑失效由版本号负责，这里只回收孤儿键。
export const DICT_CACHE_TREE_TTL_SECONDS = 24 * 60 * 60

const DICT_KEY_PREFIX = 'sys:dict' as const

export const dictKeys = {
  /**
   * 版本索引：一级节点列表、每个锚点的整树版本号、一级节点自身路径快照。
   * 不设过期时间：路径快照与版本号需要长期一致；整树孤儿键由各自的 TTL 回收。
   */
  index: (tenant: string): CacheKey<unknown> => `${DICT_KEY_PREFIX}:{${tenant}}:index` as const,
  /** 以该一级节点为根的完整无限级子树，扁平行序列；键内含版本号，旧版本键自然不可达。 */
  tree: (tenant: string, rootId: string, revision: number): CacheKey<unknown> =>
    `${DICT_KEY_PREFIX}:{${tenant}}:tree:${rootId}:${revision}` as const,
} as const
