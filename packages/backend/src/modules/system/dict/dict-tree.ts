import type { DictCacheRow } from './dict-cache.types.js'
import type { DictResponseDto } from './dto/dict.dto.js'
import { DictStatus } from './dict.types.js'

/** 展示层派生字段：由缓存行与树结构在内存中计算，数据库与缓存都不保存。 */
export interface DictTreeRow extends DictCacheRow {
  depth: number
  /** 相对当前范围根（scopeRootId）传播的可用状态，用于树内展示。 */
  enabled: boolean
  /** 相对完整祖先链的真实可用状态；只有 buildDictScope 产物带该字段，enabledOnly 必须用它判定。 */
  effective?: boolean
}

function byOrder(left: DictTreeRow, right: DictTreeRow): number {
  return left.order - right.order || (BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0)
}

export interface DictTreeBuild {
  /** 本次查询的范围根节点；null 表示全树。 */
  scopeRootId: string | null
  /** 指定范围内按树序排列的可见节点，含 enabled 派生信息。 */
  rows: DictTreeRow[]
  /** 未按空值过滤前的完整可见行，用于判断 hasChildren 与祖先可用状态。 */
  visible: DictTreeRow[]
  childrenOf: Map<string, DictTreeRow[]>
}

/**
 * 组装指定范围内的一棵子树，全部使用显式栈与数组下标，深树不依赖 JavaScript 调用栈。
 * - `scopeRootId` 为 null 时以全部一级节点为根，用于全树查询。
 * - `enabledOnly` 只保留自身及全部祖先启用的节点，停用分支整体裁剪。
 * - `includeSelf` 控制范围根节点自身是否进入结果。
 */
export function buildDictScope(
  rows: DictCacheRow[],
  scopeRootId: string | null,
  includeSelf: boolean,
  enabledOnly: boolean,
  truthTree: DictCacheRow[] = rows,
): DictTreeBuild {
  const byId = new Map(rows.map(row => [row.id, row]))
  const truthById = new Map(truthTree.map(row => [row.id, row]))
  const childrenOf = new Map<string, DictTreeRow[]>()
  const enriched = new Map<string, DictTreeRow>()
  // 用完整一级整树判定真实可用状态；范围根本身可能有停用祖先。
  const effectiveOf = (row: DictCacheRow): boolean => {
    if (row.status !== DictStatus.ENABLED)
      return false
    const parent = row.pid === null ? undefined : truthById.get(row.pid)
    return parent ? effectiveOf(parent) : true
  }
  for (const row of rows) {
    enriched.set(row.id, {
      ...row,
      depth: row.pathIds.length,
      enabled: row.status === DictStatus.ENABLED,
      effective: effectiveOf(row),
    })
  }
  for (const node of enriched.values()) {
    const key = node.pid === null ? '' : node.pid
    const siblings = childrenOf.get(key)
    if (siblings)
      siblings.push(node)
    else
      childrenOf.set(key, [node])
  }
  for (const siblings of childrenOf.values())
    siblings.sort(byOrder)

  // 自顶向下传播祖先可用状态；路径数组已保证父节点在同一份数据中。
  const visible: DictTreeRow[] = []
  const scopedRoots = scopeRootId === null
    ? childrenOf.get('') ?? []
    : [enriched.get(scopeRootId)].filter(Boolean) as DictTreeRow[]
  const stack: Array<{ node: DictTreeRow, ancestorEnabled: boolean }> = []
  for (let index = scopedRoots.length - 1; index >= 0; index--)
    stack.push({ node: scopedRoots[index], ancestorEnabled: true })
  while (stack.length) {
    const { node, ancestorEnabled } = stack.pop()!
    const enabled = ancestorEnabled && node.status === DictStatus.ENABLED
    visible.push({ ...node, enabled })
    const children = childrenOf.get(node.id)
    if (!children)
      continue
    for (let index = children.length - 1; index >= 0; index--)
      stack.push({ node: children[index], ancestorEnabled: enabled })
  }

  // 全树查询以全部一级节点为根。定点查询里，includeSelf=false 时范围根本身不入结果，
  // 但它仍是直接下级的父边界；再往下必须沿「在范围内且已在结果中」的父节点传播。
  const accepted = new Map<string, DictTreeRow>()
  const isParentOfScope = new Set<string>(scopeRootId === null ? [] : [scopeRootId])
  for (const node of visible) {
    const reachable = scopeRootId === null
      || node.id === scopeRootId
      || (node.pid !== null && isParentOfScope.has(node.pid))
    if (!reachable)
      continue
    const included = !(node.id === scopeRootId && !includeSelf) && (!enabledOnly || node.effective)
    if (included)
      accepted.set(node.id, node)
    isParentOfScope.add(node.id)
  }
  return { scopeRootId, visible, rows: [...accepted.values()], childrenOf }
}

/** 按树序展开当前范围内的节点；只依据已接受节点组装 children，避免跨范围串层。 */
export function flattenScopedRows(build: DictTreeBuild): DictTreeRow[] {
  const accepted = new Set(build.rows.map(row => row.id))
  const included = new Map<string, DictTreeRow[]>()
  for (const row of build.rows) {
    if (row.pid === null || !accepted.has(row.pid))
      continue
    const siblings = included.get(row.pid)
    if (siblings)
      siblings.push(row)
    else
      included.set(row.pid, [row])
  }
  for (const siblings of included.values())
    siblings.sort(byOrder)
  const result: DictTreeRow[] = []
  const stack: DictTreeRow[] = []
  for (let index = build.rows.length - 1; index >= 0; index--) {
    const row = build.rows[index]
    // 结果顶端是范围根（includeSelf）或范围根的直接下级，它们不在这份子映射里。
    if (row.id === build.scopeRootId || row.pid === null || !accepted.has(row.pid))
      stack.push(row)
  }
  while (stack.length) {
    const node = stack.pop()!
    result.push(node)
    const children = included.get(node.id)
    if (!children)
      continue
    for (let index = children.length - 1; index >= 0; index--)
      stack.push(children[index])
  }
  return result
}

/** 仅用于单元测试与排障：把完整行集合组装成带 children 的树。 */
export function dictTree(rows: DictResponseDto[]): DictResponseDto[] {
  const nodes = new Map(rows.map(row => [row.id, { ...row }]))
  const roots: DictResponseDto[] = []
  for (const node of nodes.values()) {
    const parent = node.pid ? nodes.get(node.pid) : undefined
    if (parent)
      (parent.children ??= []).push(node)
    else
      roots.push(node)
  }
  const levels = [roots]
  while (levels.length) {
    const siblings = levels.pop()!
    siblings.sort((left, right) => left.order - right.order
      || (BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0))
    for (const node of siblings) {
      if (node.children)
        levels.push(node.children)
    }
  }
  return roots
}

export function flattenDictTree(roots: DictResponseDto[]): DictResponseDto[] {
  const stack = [...roots].reverse()
  const result: DictResponseDto[] = []
  while (stack.length) {
    const { children, ...node } = stack.pop()!
    result.push(node)
    if (children) {
      for (let index = children.length - 1; index >= 0; index--)
        stack.push(children[index])
    }
  }
  return result
}
