<script setup lang="ts">
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { DictNode } from '#/api/system/dict';

import { ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { ChevronDown, ChevronRight, LoaderCircle } from '@vben/icons';

import { Alert, Button, message } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getDictChildren,
  getDictList,
  getDictRoots,
  setDictStatus,
} from '#/api/system/dict';

import { useColumns } from './data';
import Form from './modules/form.vue';

type DictRow = DictNode & { level: number };
const error = ref('');
const keyword = ref('');
const searchMode = ref(false);
const expanded = ref(new Set<string>());
const loading = ref(new Set<string>());
const children = new Map<string, DictNode[]>();
let roots: DictNode[] = [];
let searchRows: DictNode[] = [];
let generation = 0;
const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});
function errorText(failure: unknown) {
  return failure instanceof Error ? failure.message : '加载失败，请重试';
}
function visibleRows(): Array<DictNode & { level: number }> {
  if (searchMode.value) return searchRows.map((row) => ({ ...row, level: 0 }));
  const result: Array<DictNode & { level: number }> = [];
  const stack = roots.map((row) => ({ ...row, level: 0 })).reverse();
  while (stack.length) {
    const row = stack.pop()!;
    result.push(row);
    if (expanded.value.has(row.id)) {
      stack.push(
        ...(children.get(row.id) ?? [])
          .map((node) => ({ ...node, level: row.level + 1 }))
          .reverse(),
      );
    }
  }
  return result;
}
async function onActionClick({ code, row }: OnActionClickParams<DictNode>) {
  if (code === 'append') formModalApi.setData({ pid: row.id }).open();
  if (code === 'edit') formModalApi.setData({ id: row.id }).open();
  if (code === 'status') {
    try {
      await setDictStatus(row.id, row.status === 1 ? 0 : 1);
      message.success(
        row.status === 1 ? '字典已停用，历史节点保留' : '字典已启用',
      );
      await refreshGrid();
    } catch (failure) {
      error.value = errorText(failure);
    }
  }
}
const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '全局名称 / 编码',
        componentProps: { placeholder: '输入后搜索完整字典' },
      },
    ],
  },
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async (_params, values) => {
          const requestGeneration = ++generation;
          error.value = '';
          keyword.value = String(values.keyword ?? '')
            .trim()
            .toLowerCase();
          const query = keyword.value;
          try {
            if (query) {
              const all = await getDictList({ format: 'flat' });
              if (requestGeneration !== generation) return visibleRows();
              searchRows = all.filter(
                (row) =>
                  row.name.toLowerCase().includes(query) ||
                  row.code.includes(query),
              );
              searchMode.value = true;
            } else {
              const rows = await getDictRoots();
              if (requestGeneration !== generation) return visibleRows();
              roots = rows;
              searchMode.value = false;
              children.clear();
              expanded.value = new Set();
              loading.value = new Set();
            }
            return visibleRows();
          } catch (failure) {
            error.value = errorText(failure);
            throw failure;
          }
        },
      },
    },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions<DictRow>,
});
async function toggle(row: DictNode) {
  if (loading.value.has(row.id)) return;
  if (expanded.value.has(row.id)) {
    expanded.value.delete(row.id);
  } else {
    const requestGeneration = generation;
    loading.value.add(row.id);
    try {
      if (!children.has(row.id)) {
        const rows = await getDictChildren(row.id);
        if (requestGeneration !== generation) return;
        children.set(row.id, rows);
      }
      expanded.value.add(row.id);
      error.value = '';
    } catch (failure) {
      error.value = errorText(failure);
    } finally {
      loading.value.delete(row.id);
    }
  }
  await gridApi.grid.loadData(visibleRows());
}
async function refreshGrid() {
  await gridApi.query();
}
</script>
<template>
  <Page auto-content-height>
    <FormModal @success="refreshGrid" />
    <Alert v-if="error" class="mb-3" :message="error" type="error" show-icon />
    <Grid table-title="系统字典">
      <template #name="{ row }">
        <div
          class="flex items-center gap-2"
          :style="{ paddingLeft: `${row.level * 20}px` }"
        >
          <button
            v-if="!searchMode && row.hasChildren"
            class="text-muted-foreground hover:bg-accent focus-visible:ring-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2"
            type="button"
            :disabled="loading.has(row.id)"
            :aria-expanded="expanded.has(row.id)"
            :aria-label="`${expanded.has(row.id) ? '收起' : '展开'}${row.name}`"
            @click="toggle(row)"
          >
            <LoaderCircle
              v-if="loading.has(row.id)"
              class="h-3.5 w-3.5 animate-spin"
            />
            <ChevronDown v-else-if="expanded.has(row.id)" class="h-3.5 w-3.5" />
            <ChevronRight v-else class="h-3.5 w-3.5" />
          </button>
          <span v-else class="inline-block w-6"></span>
          <span>{{ row.name }}</span>
          <span
            v-if="row.value !== null"
            class="text-[10px] font-medium leading-none text-blue-500"
            title="节点具有业务值"
            aria-label="节点具有业务值"
            >v</span>
        </div>
      </template>
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
