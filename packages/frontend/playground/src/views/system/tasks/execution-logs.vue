<script setup lang="ts">
import type {
  ExecutionStatus,
  ScheduledTask,
  TaskExecution,
} from '#/api/system/tasks';

import { onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Modal,
  Pagination,
  Select,
  Table,
  Tag,
} from 'antdv-next';

import { getAllTaskExecutions, getTaskExecutions } from '#/api/system/tasks';

import {
  displayTime,
  executionColors,
  executionLabels,
  failureText,
} from './task-ui';

const props = defineProps<{ open: boolean; task?: ScheduledTask }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const rows = ref<TaskExecution[]>([]);
const busy = ref(false);
const error = ref('');
const page = ref(1);
const total = ref(0);
const status = ref<ExecutionStatus | undefined>();
const selected = ref<TaskExecution>();
const pageSize = 20;
let generation = 0;
const options = Object.entries(executionLabels).map(([value, label]) => ({
  value,
  label,
}));
const columns = [
  { title: '执行 ID', dataIndex: 'id', width: 100, fixed: 'left' as const },
  { title: '任务 / 处理器', key: 'task', width: 230, fixed: 'left' as const },
  { title: '触发方式', key: 'trigger', width: 100 },
  { title: '状态', key: 'status', width: 110 },
  { title: '开始时间', key: 'startedAt', width: 190 },
  { title: '耗时', key: 'durationMs', width: 110 },
  { title: '错误代码', dataIndex: 'errorCode', width: 160 },
  { title: '操作', key: 'actions', width: 80 },
];
async function load(desiredPage = 1) {
  const current = ++generation;
  const id = props.task?.id;
  busy.value = true;
  error.value = '';
  try {
    const query = {
      page: desiredPage,
      pageSize,
      status: status.value,
    };
    const result = await (id
      ? getTaskExecutions(id, query)
      : getAllTaskExecutions(query));
    if (current !== generation) return;
    rows.value = result.items;
    total.value = result.total;
    page.value = result.page;
    if (selected.value)
      selected.value =
        result.items.find((row) => row.id === selected.value?.id) ||
        selected.value;
  } catch (failure) {
    if (current === generation) error.value = failureText(failure);
  } finally {
    if (current === generation) busy.value = false;
  }
}
watch(
  () => [props.open, props.task?.id],
  () => {
    ++generation;
    if (!props.open) {
      busy.value = false;
      return;
    }
    rows.value = [];
    selected.value = undefined;
    total.value = 0;
    page.value = 1;
    status.value = undefined;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++generation;
});
</script>

<template>
  <Modal
    :open="open"
    :title="task ? `执行日志 · ${task.name}` : '全部执行日志'"
    :width="1060"
    :footer="null"
    @cancel="emit('update:open', false)"
  >
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Select
        v-model:value="status"
        :options="options"
        allow-clear
        placeholder="全部执行状态"
        aria-label="执行状态筛选"
        class="w-44"
        :disabled="busy"
        @change="load(1)"
      />
      <Button :loading="busy" @click="load(page)">刷新日志</Button>
      <span class="text-muted-foreground text-xs">按设备时区展示；执行中记录请刷新查看最终结果。</span>
    </div>
    <Alert
      v-if="error"
      class="mb-4"
      type="error"
      show-icon
      :message="error"
      role="alert"
    />
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="busy"
      :pagination="false"
      row-key="id"
      :scroll="{ x: 1150 }"
      :locale="{ emptyText: error ? '日志加载失败，请重试' : '暂无执行记录' }"
    >
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'task'">
          <div>{{ record.taskName }}</div>
          <code class="text-muted-foreground text-xs">{{
            record.handlerKey
          }}</code>
        </div>
        <template v-else-if="column.key === 'trigger'">
{{
          record.trigger === 'manual' ? '手动运行' : '定时调度'
        }}
</template>
        <Tag
          v-else-if="column.key === 'status'"
          :color="executionColors[record.status as ExecutionStatus]"
          >
{{ executionLabels[record.status as ExecutionStatus] }}
</Tag>
        <template v-else-if="column.key === 'startedAt'">
{{
          displayTime(record.startedAt)
        }}
</template>
        <template v-else-if="column.key === 'durationMs'">
{{
          record.durationMs === null ? '—' : `${record.durationMs} ms`
        }}
</template>
        <Button
          v-else-if="column.key === 'actions'"
          type="link"
          size="small"
          @click="selected = record"
          >
详情
</Button>
      </template>
    </Table>
    <div class="mt-4 flex justify-end">
      <Pagination
        :current="page"
        :total="total"
        :page-size="pageSize"
        :show-size-changer="false"
        :disabled="busy"
        :show-total="(count: number) => `共 ${count} 条`"
        @change="load"
      />
    </div>
    <section
      v-if="selected"
      class="bg-muted/40 mt-5 rounded-lg p-4"
      aria-label="执行日志详情"
    >
      <div class="mb-3 flex items-center justify-between">
        <h3 class="font-medium">执行详情 #{{ selected.id }}</h3>
        <Button type="text" size="small" @click="selected = undefined">
收起
</Button>
      </div>
      <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-muted-foreground">任务名称 / 处理器</dt>
          <dd class="break-words">
            {{ selected.taskName }} · {{ selected.handlerKey }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">执行状态</dt>
          <dd>{{ executionLabels[selected.status] }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">开始时间</dt>
          <dd>{{ displayTime(selected.startedAt) }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">结束时间</dt>
          <dd>{{ displayTime(selected.finishedAt) }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">耗时</dt>
          <dd>
            {{
              selected.durationMs === null ? '—' : `${selected.durationMs} ms`
            }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">错误代码</dt>
          <dd class="break-words">{{ selected.errorCode || '—' }}</dd>
        </div>
      </dl>
    </section>
  </Modal>
</template>
