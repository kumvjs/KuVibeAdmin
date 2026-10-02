import type { EntityManager } from 'typeorm'

/**
 * 可缓存的字典行：只保存数据库归属字段与只读路径，展示派生字段在内存中计算。
 * 结构必须保持 JSON 可序列化，新增字段时同步递增 DICT_CACHE_SCHEMA_VERSION。
 */
export interface DictCacheRow {
  id: string
  pid: string | null
  name: string
  code: string
  value: string | null
  status: 0 | 1
  order: number
  remark: string | null
  createTime: Date
  updateTime: Date
  pathIds: string[]
  pathNames: string[]
}

export interface DictTreePayload {
  rows: DictCacheRow[]
}

/** 需要失效的锚点：范围树版本号递增，并按名称维护索引里的路径快照。 */
export interface DictInvalidateRoot {
  id: string
  name: string
  /** 锚点自身改名时，索引中的名称已不可信，绑定名称清空，交由下次读取回源重算。 */
  renamed: boolean
  /** 是否是一级节点；一级节点需要登记到 roots（全树查询遍历入口）并绑定全树缓存名称。 */
  root: boolean
}

/** 写操作提交后需要执行的缓存失效计划。 */
export interface DictInvalidatePlan {
  /** 需要递增版本号的锚点；路径解析不走缓存，因此无需逐节点清理路径键。 */
  bumpedRoots: DictInvalidateRoot[]
}

export type DictTreeLoader = (manager: EntityManager) => Promise<DictCacheRow[]>
/** 节点不存在或祖先链断裂时返回 null，缓存层不缓存空结果。 */
export type DictPathLoader = (manager: EntityManager) => Promise<string[] | null>
