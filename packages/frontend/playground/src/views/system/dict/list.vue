<script setup lang="ts">
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { DictNode } from '#/api/system/dict';

import { ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';

import { Alert, Button, message } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteDict, getDictList } from '#/api/system/dict';

import { useColumns } from './data';
import Form from './modules/form.vue';

const scope = ref<DictNode>();
const error = ref('');
const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

async function onActionClick({ code, row }: OnActionClickParams<DictNode>) {
  switch (code) {
    case 'append': {
      formModalApi.setData({ pid: row.id }).open();
      break;
    }
    case 'edit': {
      formModalApi.setData({ id: row.id }).open();
      break;
    }
    case 'subtree': {
      scope.value = row;
      await refreshGrid();
      break;
    }
    case 'delete': {
      try {
        await deleteDict(row.id);
        if (scope.value?.id === row.id) scope.value = undefined;
        message.success('字典节点已删除');
        await refreshGrid();
      } catch (failure) {
        error.value =
          failure instanceof Error ? failure.message : '删除失败，请重试';
      }
      break;
    }
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '名称 / 编码',
        componentProps: { placeholder: '搜索当前范围' },
      },
    ],
  },
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async (_params, values) => {
          error.value = '';
          try {
            // 搜索使用扁平结果，并保留完整路径；普通浏览使用完整子树。
            const keyword = String(values.keyword ?? '')
              .trim()
              .toLowerCase();
            const rows = await getDictList({
              rootId: scope.value?.id,
              includeSelf: true,
              format: 'flat',
            });
            if (scope.value)
              scope.value = rows.find((node) => node.id === scope.value?.id);
            return keyword
              ? rows.filter(
                  (row) =>
                    row.name.toLowerCase().includes(keyword) ||
                    row.code.includes(keyword),
                )
              : rows;
          } catch (failure) {
            error.value =
              failure instanceof Error ? failure.message : '加载失败，请重试';
            throw failure;
          }
        },
      },
    },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
    treeConfig: { parentField: 'pid', rowField: 'id', transform: true },
  } as VxeTableGridOptions<DictNode>,
});

async function refreshGrid() {
  await gridApi.query();
}
async function showAll() {
  scope.value = undefined;
  await refreshGrid();
}
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refreshGrid" />
    <Alert v-if="error" class="mb-3" :message="error" type="error" show-icon />
    <div v-if="scope" class="mb-3 flex items-center gap-3">
      <span class="break-all">当前范围：{{ scope.fullPathName }}</span>
      <Button @click="showAll">返回全部字典</Button>
    </div>
    <Grid table-title="系统字典">
      <template #toolbar-tools>
        <Button
          v-access:code="['system:dict:create']"
          type="primary"
          @click="formModalApi.setData(null).open()"
          >
新增根节点
</Button>
      </template>
    </Grid>
  </Page>
</template>
