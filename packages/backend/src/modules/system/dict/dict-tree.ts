import type { DictResponseDto } from './dto/dict.dto.js'

/** 组装与展开使用显式栈，层级不依赖 JavaScript 调用栈。 */
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
