import type { DictResponseDto } from './dto/dict.dto.js'
import { ConflictException } from '@nestjs/common'

/** 完整管理集合或定点结果组树；不派生/保存路径，不依赖递归调用栈。 */
export function formatDictRows(rows: DictResponseDto[], format: 'flat' | 'tree', propagate = false): DictResponseDto[] {
  const nodes = new Map(rows.map(row => [row.id, { ...row }]))
  const roots: DictResponseDto[] = []
  for (const node of nodes.values()) {
    const parent = node.pid === null ? undefined : nodes.get(node.pid)
    if (parent)
      (parent.children ??= []).push(node)
    else
      roots.push(node)
  }
  const ordered: DictResponseDto[] = []
  const stack = [...roots].reverse()
  while (stack.length) {
    const node = stack.pop()!
    if (propagate) {
      const parent = node.pid === null ? undefined : nodes.get(node.pid)
      node.effectiveStatus = node.status === 1 && (!parent || parent.effectiveStatus === 1) ? 1 : 0
    }
    const { children, ...flat } = node
    ordered.push(flat)
    if (children)
      stack.push(...[...children].reverse())
  }
  if (ordered.length !== rows.length)
    throw new ConflictException('字典结构存在循环，请修复数据')
  return format === 'flat' ? ordered : roots
}
