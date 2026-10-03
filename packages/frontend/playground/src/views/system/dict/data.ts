import type { VxeTableGridColumns } from '@vben/plugins/vxe-table';

import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn } from '#/adapter/vxe-table';
import type { DictNode } from '#/api/system/dict';

import { getPopupContainer } from '@vben/utils';

import { z } from '#/adapter/form';

export function useSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: '节点名称',
      componentProps: { maxLength: 100 },
      rules: z
        .string()
        .min(1)
        .max(100)
        .refine((value) => value.trim() === value, '名称首尾不能有空白'),
    },
    {
      component: 'Input',
      fieldName: 'code',
      label: '唯一编码',
      componentProps: {
        maxLength: 100,
        placeholder: '例如 system.user.status',
      },
      rules: z
        .string()
        .max(100)
        .regex(
          /^[a-z][a-z0-9_.-]*$/,
          '小写字母开头，可含数字、点、下划线和短横线',
        ),
    },
    {
      component: 'TreeSelect',
      fieldName: 'pid',
      label: '上级节点',
      defaultValue: '0',
      componentProps: {
        class: 'w-full',
        showSearch: true,
        placeholder: '搜索名称或编码，选择上级节点',
        fieldNames: { label: 'label', value: 'value', children: 'children' },
        getPopupContainer,
        treeNodeFilterProp: 'label',
        treeData: [],
      },
      rules: 'required',
    },
    {
      component: 'Switch',
      fieldName: 'hasValue',
      label: '设置节点值',
      defaultValue: false,
    },
    {
      component: 'Input',
      fieldName: 'value',
      label: '节点值',
      defaultValue: '',
      componentProps: {
        maxLength: 1000,
        placeholder: '可留空，空字符串也可作为字典值',
      },
      rules: z.string().max(1000).optional(),
      dependencies: {
        show: (values) => !!values.hasValue,
        triggerFields: ['hasValue'],
      },
    },
    {
      component: 'InputNumber',
      fieldName: 'order',
      label: '同级排序',
      defaultValue: 0,
      componentProps: {
        class: 'w-full',
        min: 0,
        max: 2_147_483_647,
        precision: 0,
      },
      rules: z.number().int().min(0).max(2_147_483_647),
    },
    {
      component: 'Switch',
      fieldName: 'cacheEnabled',
      label: '允许业务查询缓存',
      defaultValue: false,
    },
    {
      component: 'Textarea',
      fieldName: 'remark',
      label: '备注',
      componentProps: { maxLength: 500, rows: 3, showCount: true },
      rules: z.string().max(500).optional(),
    },
  ];
}

export function useColumns(
  onActionClick: OnActionClickFn<DictNode>,
): VxeTableGridColumns<DictNode> {
  return [
    {
      field: 'name',
      title: '节点名称',
      slots: { default: 'name' },
      fixed: 'left',
      minWidth: 240,
    },
    { field: 'code', title: '唯一编码', minWidth: 200 },
    {
      field: 'value',
      title: '节点值',
      minWidth: 120,
      formatter: ({ row }) =>
        row.value === null
          ? '未设置'
          : row.value === ''
            ? '（空字符串）'
            : row.value,
    },
    {
      field: 'status',
      title: '状态',
      width: 100,
      formatter: ({ row }) => (row.status === 1 ? '启用' : '停用'),
    },
    {
      field: 'effectiveStatus',
      title: '实际可用',
      width: 120,
      formatter: ({ row }) =>
        row.effectiveStatus === 1 ? '可用' : '自身或上级停用',
    },
    { field: 'order', title: '排序', width: 80 },
    {
      field: 'operation',
      title: '操作',
      fixed: 'right',
      width: 280,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        attrs: {
          nameField: 'name',
          nameTitle: '字典节点',
          onClick: onActionClick,
        },
        options: [
          { code: 'append', text: '新增下级', auth: ['system:dict:create'] },
          { code: 'edit', auth: ['system:dict:update'] },
          {
            code: 'status',
            text: (row: DictNode) => (row.status === 1 ? '停用' : '启用'),
            auth: ['system:dict:disable'],
          },
        ],
      },
    },
  ];
}
