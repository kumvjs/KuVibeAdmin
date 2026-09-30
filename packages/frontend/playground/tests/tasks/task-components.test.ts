/* eslint-disable vue/one-component-per-file -- 组件测试使用轻量 Antdv 替身。 */
import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import ExecutionLogs from '#/views/system/tasks/execution-logs.vue';
import TaskEditor from '#/views/system/tasks/task-editor.vue';

const api = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  getTaskExecutions: vi.fn(),
  getAllTaskExecutions: vi.fn(),
}));
vi.mock('#/api/system/tasks', () => api);
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  const Container = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('section', slots.default?.()),
  });
  return {
    Modal: Container,
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean, htmlType: { type: String, default: 'button' } },
      setup:
        (props, { slots }) =>
        () =>
          h(
            'button',
            {
              type: props.htmlType || 'button',
              disabled: props.disabled || props.loading,
            },
            slots.default?.(),
          ),
    }),
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Select: Container,
    Tag: Container,
    Pagination: Container,
    Table: defineComponent({
      props: { dataSource: { type: Array, default: () => [] } },
      setup: (props) => () =>
        h('div', { 'data-rows': true }, JSON.stringify(props.dataSource)),
    }),
  };
});
const handlers = [
  { key: 'attachments.cleanup', name: '附件清理', description: '清理过期附件' },
];
const task = {
  id: '9007199254740993',
  name: '清理任务',
  handlerKey: 'attachments.cleanup',
  cronExpression: '0 * * * * *',
  timeZone: 'Asia/Shanghai',
  enabled: false,
  description: null,
  createdAt: '2026-09-30T01:00:00Z',
  updatedAt: '2026-09-30T01:00:00Z',
};
const log = {
  id: '9007199254740994',
  taskId: task.id,
  taskName: task.name,
  handlerKey: task.handlerKey,
  trigger: 'manual',
  status: 'running',
  startedAt: task.createdAt,
  finishedAt: null,
  durationMs: null,
  errorCode: null,
};
let app: ReturnType<typeof createApp> | undefined;
let root: HTMLDivElement;
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
}
beforeEach(() => {
  vi.resetAllMocks();
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
});

it('编辑提交互斥，未知结果保留表单与原任务 ID，失败后可重试', async () => {
  let reject!: (error: Error) => void;
  api.updateTask.mockReturnValueOnce(
    new Promise((_, no) => {
      reject = no;
    }),
  );
  const props = reactive({ open: false, task, handlers });
  const saved = vi.fn();
  app = createApp({
    render: () => h(TaskEditor, { ...props, onSaved: saved }),
  });
  app.mount(root);
  props.open = true;
  await flush();
  root
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  root
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  expect(api.updateTask).toHaveBeenCalledTimes(1);
  expect(api.updateTask.mock.calls[0]![0]).toBe(task.id);
  reject(new Error('网络中断，结果未知'));
  await flush();
  expect(saved).not.toHaveBeenCalled();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain(
    '结果未知',
  );
  expect(root.querySelector('input')?.value).toBe(task.name);
  api.updateTask.mockResolvedValue(task);
  root
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(api.updateTask).toHaveBeenCalledTimes(2);
  expect(saved).toHaveBeenCalledTimes(1);
});

it('快速切换任务后迟到日志不覆盖当前任务，执行中不显示成功', async () => {
  let resolve!: (value: unknown) => void;
  api.getTaskExecutions.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  api.getTaskExecutions.mockResolvedValueOnce({
    items: [{ ...log, taskId: '2', taskName: '新任务' }],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  const props = reactive({ open: true, task });
  app = createApp({ render: () => h(ExecutionLogs, props) });
  app.mount(root);
  await flush();
  props.task = { ...task, id: '2', name: '新任务' };
  await flush();
  resolve({
    items: [{ ...log, taskName: '旧任务' }],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  await flush();
  const rendered = root.querySelector('[data-rows]')!.textContent;
  expect(rendered).toContain('新任务');
  expect(rendered).not.toContain('旧任务');
  expect(rendered).toContain('running');
  expect(rendered).not.toContain('success');
});

it('全部日志读取全局接口，删除任务的历史快照仍可展示', async () => {
  api.getAllTaskExecutions.mockResolvedValue({
    items: [{ ...log, taskName: '已删除任务' }],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  app = createApp({ render: () => h(ExecutionLogs, { open: true }) });
  app.mount(root);
  await flush();
  expect(api.getAllTaskExecutions).toHaveBeenCalledWith({
    page: 1,
    pageSize: 20,
    status: undefined,
  });
  expect(api.getTaskExecutions).not.toHaveBeenCalled();
  expect(root.querySelector('[data-rows]')!.textContent).toContain(
    '已删除任务',
  );
});
