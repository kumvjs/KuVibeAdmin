<script setup lang="ts">
import type { ScheduledTask, TaskHandler, TaskQuery } from '#/api/system/tasks';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Table,
  Tag,
} from 'antdv-next';

import {
  deleteTask,
  getTaskHandlers,
  getTasks,
  runTask,
  setTaskStatus,
} from '#/api/system/tasks';

import ExecutionLogs from './execution-logs.vue';
import TaskEditor from './task-editor.vue';
import { displayTime, executionLabels, failureText } from './task-ui';

const access = useAccessStore();
const can = (code: string) =>
  access.accessCodes.includes(`system:task:${code}`);
const allowed = computed(() => can('list'));
const rows = ref<ScheduledTask[]>([]);
const handlers = ref<TaskHandler[]>([]);
const busy = ref(false);
const operation = ref('');
const error = ref('');
const handlerError = ref('');
const page = ref(1);
const total = ref(0);
const pageSize = 20;
const filters = reactive({
  keyword: '',
  enabled: undefined as 'false' | 'true' | undefined,
});
let applied: Pick<TaskQuery, 'enabled' | 'keyword'> = {};
let generation = 0;
let alive = true;
const editorOpen = ref(false);
const editing = ref<ScheduledTask>();
const logsOpen = ref(false);
const logsTask = ref<ScheduledTask>();
const locked = computed(() => busy.value || Boolean(operation.value));
const columns = [
  { title: '任务名称', key: 'name', width: 200, fixed: 'left' as const },
  { title: '处理器', dataIndex: 'handlerKey', width: 180 },
  { title: 'Cron / 调度时区', key: 'schedule', width: 240 },
  { title: '状态', key: 'enabled', width: 90 },
  { title: '更新时间', key: 'updatedAt', width: 190 },
  { title: '操作', key: 'actions', width: 300 },
];
const enabledOptions = [
  { label: '已启用', value: 'true' },
  { label: '已停用', value: 'false' },
];
async function load(desiredPage = 1, applyFilters = false) {
  if (!allowed.value) return;
  const current = ++generation;
  const desired = applyFilters
    ? {
        keyword: filters.keyword.trim() || undefined,
        enabled:
          filters.enabled === undefined
            ? undefined
            : filters.enabled === 'true',
      }
    : applied;
  busy.value = true;
  error.value = '';
  try {
    const result = await getTasks({ page: desiredPage, pageSize, ...desired });
    if (!alive || current !== generation) return;
    rows.value = result.items;
    total.value = result.total;
    page.value = result.page;
    applied = { ...desired };
  } catch (failure) {
    if (alive && current === generation) error.value = failureText(failure);
  } finally {
    if (alive && current === generation) busy.value = false;
  }
}
async function loadHandlers() {
  if (!can('create') && !can('update')) return;
  handlerError.value = '';
  try {
    const result = await getTaskHandlers();
    if (alive) handlers.value = result;
  } catch (failure) {
    if (alive) handlerError.value = failureText(failure);
  }
}
function edit(task?: ScheduledTask) {
  editing.value = task;
  editorOpen.value = true;
}
function logs(task?: ScheduledTask) {
  logsTask.value = task;
  logsOpen.value = true;
}
async function mutate(id: string, action: () => Promise<unknown>) {
  if (locked.value) return;
  operation.value = id;
  error.value = '';
  try {
    await action();
    if (alive) await load(page.value);
  } catch (failure) {
    if (alive) error.value = failureText(failure);
  } finally {
    if (alive) operation.value = '';
  }
}
function toggle(task: ScheduledTask) {
  return mutate(task.id, async () => {
    await setTaskStatus(task.id, !task.enabled);
    message.success(task.enabled ? '任务已停用' : '任务已启用');
  });
}
function remove(task: ScheduledTask) {
  Modal.confirm({
    title: '删除定时任务',
    content: `确认删除“${task.name}”？删除后停止调度，历史日志仍由服务端保留。`,
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: () =>
      mutate(task.id, async () => {
        await deleteTask(task.id);
        message.success('任务已删除');
      }),
  });
}
function execute(task: ScheduledTask) {
  Modal.confirm({
    title: '手动运行任务',
    content: `现在执行“${task.name}”？手动运行会调用真实处理器；停用状态不限制手动运行。`,
    okText: '运行',
    cancelText: '取消',
    onOk: () =>
      mutate(task.id, async () => {
        const result = await runTask(task.id);
        const text = `执行 #${result.id}：${executionLabels[result.status]}`;
        if (result.status === 'failed') message.error(text);
        else if (result.status === 'success') message.success(text);
        else message.info(text);
        if (can('log') && alive) logs(task);
      }),
  });
}
function saved() {
  message.success('任务配置已保存');
  void load(page.value);
}
onMounted(() => {
  void load();
  void loadHandlers();
});
onBeforeUnmount(() => {
  alive = false;
  ++generation;
});
</script>

<template>
  <Page title="任务调度" description="在线维护定时任务，追踪服务端执行结果。">
    <Alert
      v-if="!allowed"
      type="warning"
      show-icon
      message="没有查看任务调度的权限，请联系管理员"
    />
    <Card v-else title="定时任务" :bordered="false">
      <template #extra>
        <div class="flex flex-wrap gap-2">
          <Button v-if="can('log')" :disabled="locked" @click="logs()">
全部执行日志
</Button>
          <Button
            v-if="can('create')"
            type="primary"
            :disabled="locked || handlers.length === 0"
            @click="edit()"
            >
新建任务
</Button>
        </div>
      </template>
      <form
        class="mb-5 flex flex-wrap items-center gap-3"
        @submit.prevent="load(1, true)"
      >
        <Input
          v-model:value="filters.keyword"
          allow-clear
          placeholder="搜索任务名称或处理器"
          aria-label="任务关键词"
          class="w-full sm:w-64"
          :disabled="locked"
        />
        <Select
          v-model:value="filters.enabled"
          :options="enabledOptions"
          allow-clear
          placeholder="全部状态"
          aria-label="任务启停状态"
          class="w-36"
          :disabled="locked"
        />
        <Button
          type="primary"
          html-type="submit"
          :loading="busy"
          :disabled="Boolean(operation)"
          >
查询
</Button>
        <Button :disabled="locked" @click="load(page)">刷新</Button>
      </form>
      <Alert
        v-if="handlerError"
        type="warning"
        show-icon
        class="mb-4"
        :message="`处理器列表加载失败：${handlerError}`"
        >
<template #action>
<Button size="small" @click="loadHandlers">重试</Button>
</template>
</Alert>
      <Alert
        v-if="error"
        type="error"
        show-icon
        class="mb-4"
        :message="error"
        role="alert"
      />
      <Table
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :pagination="false"
        :loading="busy"
        :scroll="{ x: 1200 }"
        :locale="{ emptyText: error ? '任务加载失败，请重试' : '暂无定时任务' }"
      >
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'name'">
            <div class="font-medium">{{ record.name }}</div>
            <div class="text-muted-foreground mt-1 line-clamp-2 text-xs">
              {{ record.description || `任务 #${record.id}` }}
            </div>
          </div>
          <div v-else-if="column.key === 'schedule'">
            <code>{{ record.cronExpression }}</code>
            <div class="text-muted-foreground mt-1 text-xs">
              {{ record.timeZone }}
            </div>
          </div>
          <Tag
            v-else-if="column.key === 'enabled'"
            :color="record.enabled ? 'success' : 'default'"
            >
{{ record.enabled ? '已启用' : '已停用' }}
</Tag>
          <template v-else-if="column.key === 'updatedAt'">
{{
            displayTime(record.updatedAt)
          }}
</template>
          <div
            v-else-if="column.key === 'actions'"
            class="flex flex-wrap gap-1"
          >
            <Button
              v-if="can('update')"
              type="link"
              size="small"
              :disabled="locked || handlers.length === 0"
              @click="edit(record)"
              >
编辑
</Button>
            <Button
              v-if="can('update')"
              type="link"
              size="small"
              :disabled="locked"
              @click="toggle(record)"
              >
{{ record.enabled ? '停用' : '启用' }}
</Button>
            <Button
              v-if="can('run')"
              type="link"
              size="small"
              :disabled="locked"
              :loading="operation === record.id"
              @click="execute(record)"
              >
运行
</Button>
            <Button
              v-if="can('log')"
              type="link"
              size="small"
              :disabled="locked"
              @click="logs(record)"
              >
日志
</Button>
            <Button
              v-if="can('delete')"
              type="link"
              danger
              size="small"
              :disabled="locked"
              @click="remove(record)"
              >
删除
</Button>
          </div>
        </template>
      </Table>
      <div class="mt-5 flex justify-end">
        <Pagination
          :current="page"
          :total="total"
          :page-size="pageSize"
          :show-size-changer="false"
          :disabled="locked"
          :show-total="(count: number) => `共 ${count} 个任务`"
          @change="(nextPage: number) => load(nextPage)"
        />
      </div>
    </Card>
    <TaskEditor
      v-model:open="editorOpen"
      :task="editing"
      :handlers="handlers"
      @saved="saved"
    />
    <ExecutionLogs v-model:open="logsOpen" :task="logsTask" />
  </Page>
</template>
