import type { DictNode } from '#/api/system/dict';

import { describe, expect, it } from 'vitest';

import { dictWrite, parentOptions } from '#/views/system/dict/helpers';

describe('字典新模型编辑', () => {
  it('父级下拉保留层级，排除自身及后代并保持 bigint 字符串', () => {
    const rows = [
      { id: '1', pid: null, name: '根', code: 'root' },
      { id: '9007199254740993', pid: '1', name: '编辑节点', code: 'edit' },
      { id: '2', pid: '9007199254740993', name: '下级', code: 'child' },
      { id: '3', pid: '2', name: '后代', code: 'descendant' },
      { id: '4', pid: null, name: '其他根', code: 'other' },
    ] as DictNode[];
    expect(
      parentOptions(rows, '9007199254740993').map((row) => row.value),
    ).toEqual(['0', '1', '4']);
    expect(parentOptions(rows)[1]?.children?.[0]).toEqual({
      value: '9007199254740993',
      label: '编辑节点 (edit)',
      children: [
        {
          value: '2',
          label: '下级 (child)',
          children: [{ value: '3', label: '后代 (descendant)' }],
        },
      ],
    });
    const cyclic = [
      { id: '5', pid: '6', name: '环一', code: 'cycle.one' },
      { id: '6', pid: '5', name: '环二', code: 'cycle.two' },
    ] as DictNode[];
    expect(parentOptions([...rows, ...cyclic])).toEqual(parentOptions(rows));
  });
  it('null/空字符串/0 不混淆，默认缓存关闭且不提交路径/状态', () => {
    const fields = {
      name: '节点',
      code: 'node',
      pid: '0',
      hasValue: true,
      value: '',
      pathIds: ['伪造'],
      status: 0,
    };
    expect(dictWrite(fields)).toEqual({
      name: '节点',
      code: 'node',
      pid: null,
      value: '',
      order: 0,
      remark: null,
      cacheEnabled: false,
    });
    expect(
      dictWrite({ ...fields, value: '0', cacheEnabled: true }),
    ).toMatchObject({ value: '0', cacheEnabled: true });
    expect(dictWrite({ ...fields, hasValue: false }).value).toBeNull();
  });
});
