<script setup lang="ts">
import type { DictNode } from '#/api/system/dict';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Alert } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import {
  createDict,
  getDict,
  getDictList,
  updateDict,
} from '#/api/system/dict';

import { useSchema } from '../data';
import { dictWrite, parentOptions } from '../helpers';

const emit = defineEmits(['success']);
const current = ref<DictNode>();
const error = ref('');
const ready = ref(false);
type ModalData = null | { id?: string; pid?: string };

const [Form, formApi] = useVbenForm({
  layout: 'vertical',
  schema: useSchema(),
  showDefaultActions: false,
});
const title = computed(() => (current.value ? '编辑字典节点' : '新增字典节点'));
function errorText(failure: unknown) {
  return failure instanceof Error ? failure.message : '操作失败，请重试';
}
const [Modal, modalApi] = useVbenModal<ModalData>({
  async onConfirm() {
    if (!ready.value) return;
    const { valid } = await formApi.validate();
    if (!valid) return;
    modalApi.lock();
    error.value = '';
    try {
      const body = dictWrite(await formApi.getValues());
      if (current.value) {
        const { code: _code, ...update } = body;
        await updateDict(current.value.id, update);
      } else await createDict(body);
      modalApi.close();
      emit('success');
    } catch (failure) {
      error.value = errorText(failure);
    } finally {
      modalApi.lock(false);
    }
  },
  async onOpenChange(open) {
    if (!open) return;
    current.value = undefined;
    ready.value = false;
    error.value = '';
    modalApi.lock();
    try {
      await formApi.reset();
      const data = modalApi.getData();
      const [rows, node] = await Promise.all([
        getDictList({ format: 'flat' }),
        data?.id ? getDict(data.id) : Promise.resolve(undefined),
      ]);
      current.value = node;
      formApi.updateSchema([
        {
          fieldName: 'code',
          componentProps: { disabled: !!node },
        },
        {
          fieldName: 'hasValue',
          componentProps: { disabled: !!node && node.value !== null },
        },
        {
          fieldName: 'value',
          componentProps: { disabled: !!node && node.value !== null },
        },
        {
          fieldName: 'pid',
          componentProps: { treeData: parentOptions(rows, node?.id) },
        },
      ]);
      await formApi.setValues(
        node
          ? {
              ...node,
              pid: node.pid ?? '0',
              remark: node.remark ?? '',
              value: node.value ?? '',
              hasValue: node.value !== null,
            }
          : {
              pid: data?.pid ?? '0',
              hasValue: false,
              cacheEnabled: false,
              order: 0,
            },
      );
      ready.value = true;
    } catch (failure) {
      error.value = errorText(failure);
    } finally {
      modalApi.lock(false);
    }
  },
});

defineExpose({ modalApi });
</script>

<template>
  <Modal :title="title">
    <Alert v-if="error" class="mb-4" :message="error" type="error" show-icon />
    <p v-if="current" class="text-muted-foreground mb-4 break-all">
      {{ current.name }}：编码创建后不可修改；已有业务值请停用后新建替代节点。
    </p>
    <Form class="mx-4" />
  </Modal>
</template>
