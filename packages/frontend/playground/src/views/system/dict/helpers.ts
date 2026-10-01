import type { DictNode, DictWrite } from '#/api/system/dict';

export function parentOptions(rows: DictNode[], editingId?: string) {
  return [
    { label: '根节点', value: '0' },
    ...rows
      .filter((node) => !editingId || !node.pathIds.includes(editingId))
      .map((node) => ({
        label: `${node.fullPathName} (${node.code})`,
        value: node.id,
      })),
  ];
}

/** 只提交可写字段，路径等派生数据由服务端维护。 */
export function dictWrite(values: Record<string, unknown>): DictWrite {
  return {
    code: String(values.code),
    name: String(values.name),
    order: Number(values.order ?? 0),
    pid: values.pid && values.pid !== '0' ? String(values.pid) : null,
    remark: values.remark ? String(values.remark) : null,
    status: values.status as 0 | 1,
    value: values.hasValue ? String(values.value ?? '') : null,
  };
}
