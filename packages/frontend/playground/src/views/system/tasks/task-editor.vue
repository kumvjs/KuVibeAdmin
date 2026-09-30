<script setup lang="ts">
import type {
  ScheduledTask,
  TaskConfiguration,
  TaskHandler,
} from '#/api/system/tasks';

import { computed, reactive, ref, watch } from 'vue';

import { Alert, Button, Modal } from 'antdv-next';

import { createTask, updateTask } from '#/api/system/tasks';

import { failureText, validateConfiguration } from './task-ui';

const props = defineProps<{
  handlers: TaskHandler[];
  open: boolean;
  task?: ScheduledTask;
}>();
const emit = defineEmits<{
  saved: [];
  'update:open': [open: boolean];
}>();
const busy = ref(false);
const error = ref('');
const values = reactive<TaskConfiguration>({
  name: '',
  handlerKey: '',
  cronExpression: '0 * * * * *',
  timeZone: 'Asia/Shanghai',
  enabled: false,
  description: null,
});
const handler = computed(() =>
  props.handlers.find((item) => item.key === values.handlerKey),
);
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = '';
    Object.assign(
      values,
      props.task
        ? {
            name: props.task.name,
            handlerKey: props.task.handlerKey,
            cronExpression: props.task.cronExpression,
            timeZone: props.task.timeZone,
            enabled: props.task.enabled,
            description: props.task.description,
          }
        : {
            name: '',
            handlerKey: '',
            cronExpression: '0 * * * * *',
            timeZone: 'Asia/Shanghai',
            enabled: false,
            description: null,
          },
    );
  },
  { immediate: true },
);
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  let submitted = false;
  try {
    const configuration = validateConfiguration(values, props.handlers);
    submitted = true;
    if (props.task) await updateTask(props.task.id, configuration);
    else await createTask(configuration);
    emit('saved');
    emit('update:open', false);
  } catch (failure) {
    error.value = failureText(failure);
    if (!props.task && submitted) error.value += '；请先刷新任务列表确认是否已创建，再决定重试。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="task ? '编辑定时任务' : '新建定时任务'"
    :width="680"
    :footer="null"
    :mask-closable="false"
    :closable="!busy"
    :keyboard="!busy"
    @cancel="!busy && emit('update:open', false)"
  >
    <form class="task-form" @submit.prevent="save">
      <label class="task-field"><span>任务名称 *</span>
        <input
          v-model="values.name"
          class="task-input"
          required
          maxlength="100"
          :disabled="busy"
        />
      </label>
      <label class="task-field"><span>任务处理器 *</span>
        <select
          v-model="values.handlerKey"
          class="task-input"
          required
          :disabled="busy"
        >
          <option value="" disabled>选择已注册处理器</option>
          <option v-for="item in handlers" :key="item.key" :value="item.key">
            {{ item.name }} · {{ item.key }}
          </option>
        </select>
        <span class="task-muted">{{
          handler?.description || '处理器由服务端提供，配置会在保存时再次校验。'
        }}</span>
      </label>
      <label class="task-field"><span>Cron 表达式 *</span>
        <input
          v-model="values.cronExpression"
          class="task-input font-mono"
          required
          maxlength="100"
          :disabled="busy"
          placeholder="0 * * * * *"
        />
        <span class="task-muted">六段：秒 分 时 日 月 周。例如 0 * * * * * 表示每分钟执行。</span>
      </label>
      <label class="task-field"><span>调度时区 *</span>
        <input
          v-model="values.timeZone"
          class="task-input"
          required
          maxlength="100"
          :disabled="busy"
          list="task-timezones"
          placeholder="Asia/Shanghai"
        />
        <datalist id="task-timezones">
          <option value="Asia/Shanghai"></option>
          <option value="UTC"></option>
          <option value="America/New_York"></option>
        </datalist>
        <span class="task-muted">按此 IANA 时区解释 Cron；日志时间按当前设备时区显示。</span>
      </label>
      <label class="task-field"><span>说明</span>
        <textarea
          v-model="values.description"
          class="task-input"
          rows="3"
          maxlength="500"
          :disabled="busy"
        ></textarea>
      </label>
      <label class="flex items-center gap-2"><input
          v-model="values.enabled"
          type="checkbox"
          :disabled="busy"
        />保存后启用自动调度</label>
      <Alert
        v-if="error"
        type="error"
        show-icon
        :message="error"
        role="alert"
      />
      <div class="flex justify-end gap-2">
        <Button :disabled="busy" @click="emit('update:open', false)">
取消
</Button>
        <Button
          type="primary"
          html-type="submit"
          :loading="busy"
          :disabled="handlers.length === 0"
          >
保存任务
</Button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.task-form {
  display: grid;
  gap: 18px;
}
.task-field {
  display: grid;
  gap: 6px;
}
.task-input {
  width: 100%;
  padding: 8px 12px;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}
.task-input:focus {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.task-muted {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.task-input:disabled {
  opacity: 0.6;
}
</style>
