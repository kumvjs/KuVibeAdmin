import type { DictNode } from '#/api/system/dict';

import { describe, expect, it } from 'vitest';

import { dictWrite, parentOptions } from '#/views/system/dict/helpers';

describe('字典节点编辑', () => {
  it('父级选项排除自身与任意深度后代，保持 bigint 字符串', () => {
    const rows = [
      { id: '1', pathIds: ['1'], fullPathName: '根', code: 'root' },
      {
        id: '9007199254740993',
        pathIds: ['1', '9007199254740993'],
        fullPathName: '根 / 编辑节点',
        code: 'edit',
      },
      {
        id: '3',
        pathIds: ['1', '9007199254740993', '2', '3'],
        fullPathName: '后代',
        code: 'descendant',
      },
      { id: '4', pathIds: ['4'], fullPathName: '其他根', code: 'other' },
    ] as DictNode[];
    expect(
      parentOptions(rows, '9007199254740993').map((row) => row.value),
    ).toEqual(['0', '1', '4']);
    expect(parentOptions(rows)[2]?.value).toBe('9007199254740993');
  });

  it('保留空值语义，清空父级回到根，只提交可写字段', () => {
    const fields = {
      name: '节点',
      code: 'node',
      order: 0,
      status: 1,
      pid: '0',
      value: '',
      hasValue: true,
      fullPathId: '/伪造/',
      pathNames: ['伪造'],
    };
    expect(dictWrite(fields)).toEqual({
      name: '节点',
      code: 'node',
      order: 0,
      status: 1,
      pid: null,
      value: '',
      remark: null,
    });
    expect(dictWrite({ ...fields, hasValue: false }).value).toBeNull();
  });
});
