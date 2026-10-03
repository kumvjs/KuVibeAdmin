/* eslint-disable vue/one-component-per-file -- 使用弹窗和按钮替身验证实际业务表单提交。 */
import { createApp, h, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { promotionFields } from '#/views/billing/fields';
import FormEditor from '#/views/billing/form-editor.vue';

vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { userId: '1' } }),
  useAccessStore: () => ({ accessCodes: [] }),
}));
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Select: defineComponent({
      props: { value: { type: Array, default: () => [] }, options: { type: Array, default: () => [] } },
      emits: ['update:value'],
      setup: (props, { emit }) => () => h('select', {
        multiple: true,
        value: props.value,
        onChange: (event: Event) => emit('update:value', [...(event.target as HTMLSelectElement).selectedOptions].map((option) => option.value)),
      }, (props.options ?? []).map((option: { label: string; value: string }) => h('option', { value: option.value }, option.label))),
    }),
    Modal: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', slots.default?.()),
    }),
    Button: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('button', slots.default?.()),
    }),
  };
});
let app: ReturnType<typeof createApp> | undefined;
let root: HTMLDivElement;
const commit = vi.fn().mockResolvedValue({ id: '1' });
const initial = {
  title: '连续赠送',
  effect: 'bonus_consecutive',
  maxConsecutiveDays: 2,
  dailyBonusPoints: ['0', '9007199254740993'],
  channels: ['wechat'],
  packageIds: ['1'],
  startsAt: '2026-09-01T00:00:00Z',
  endsAt: '2026-10-01T00:00:00Z',
};
async function flush() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
function mount(body = initial) {
  app = createApp({
    render: () =>
      h(FormEditor, {
        open: true,
        title: '新增活动',
        fields: promotionFields,
        initial: body,
        commit,
      }),
  });
  app.mount(root);
}
beforeEach(() => {
  commit.mockClear();
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
});

it('连续赠送展示逐日积分与默认每天首笔，隐藏现金减免字段，保持大整数精度', async () => {
  mount();
  await flush();
  expect(root.textContent).toContain('第 1 天赠送积分');
  expect(root.textContent).toContain('第 2 天赠送积分');
  expect(root.textContent).not.toContain('最低原价门槛');
  expect(root.textContent).not.toContain('现金减免预算');
  root
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      maxConsecutiveDays: 2,
      dailyBonusPoints: ['0', '9007199254740993'],
      consecutiveGrantMode: 'daily_first',
    }),
  );
  expect(commit.mock.calls[0]?.[0]).not.toHaveProperty('value');
});
it('修改最大天数保留已有额度、增加逐日输入；可切换每单赠送', async () => {
  mount();
  await flush();
  const max = [...root.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('最大天数'))
    ?.querySelector('input');
  if (!max) throw new Error('最大天数字段缺失');
  max.value = '3';
  max.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  expect(root.textContent).toContain('第 3 天赠送积分');
  const mode = [...root.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('赠送频率'))
    ?.querySelector('select');
  if (!mode) throw new Error('赠送频率字段缺失');
  mode.value = 'every_order';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
  root
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      maxConsecutiveDays: 3,
      dailyBonusPoints: ['0', '9007199254740993', '0'],
      consecutiveGrantMode: 'every_order',
    }),
  );
});
it('赠送积分为负数时阻止提交并保留表单错误', async () => {
  mount({ ...initial, dailyBonusPoints: ['-1', '20'] });
  await flush();
  root
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  expect(commit).not.toHaveBeenCalled();
  expect(root.querySelector('[role="alert"]')).not.toBeNull();
});
