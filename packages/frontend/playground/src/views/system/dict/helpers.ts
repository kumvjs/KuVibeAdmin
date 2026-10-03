import type { DictNode, DictWrite } from '#/api/system/dict';

interface ParentOption {
  children?: ParentOption[];
  label: string;
  value: string;
}

export function parentOptions(
  rows: DictNode[],
  editingId?: string,
): ParentOption[] {
  const byId = new Map(rows.map((node) => [node.id, node]));
  const options = new Map<string, ParentOption>();
  for (const node of rows) {
    const seen = new Set<string>();
    let current: DictNode | undefined = node;
    while (current && current.id !== editingId && !seen.has(current.id)) {
      seen.add(current.id);
      current = current.pid ? byId.get(current.pid) : undefined;
    }
    if (!current) {
      options.set(node.id, {
        label: `${node.name} (${node.code})`,
        value: node.id,
      });
    }
  }
  const roots: ParentOption[] = [{ label: '根节点（无上级）', value: '0' }];
  for (const node of rows) {
    const option = options.get(node.id);
    if (!option) continue;
    const parent = node.pid ? options.get(node.pid) : undefined;
    if (parent) (parent.children ??= []).push(option);
    else roots.push(option);
  }
  return roots;
}
/** 写入仅提交领域字段，父级ID保持字符串。 */
export function dictWrite(values: Record<string, unknown>): DictWrite {
  return {
    code: String(values.code),
    name: String(values.name),
    cacheEnabled: values.cacheEnabled === true,
    order: Number(values.order ?? 0),
    pid: values.pid && values.pid !== '0' ? String(values.pid) : null,
    remark: values.remark ? String(values.remark) : null,
    value: values.hasValue ? String(values.value ?? '') : null,
  };
}
