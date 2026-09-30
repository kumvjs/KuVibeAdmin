/* eslint-disable vue/one-component-per-file -- 隔离扫码面板的按钮和二维码测试替身。 */
import { createApp, h, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import PaymentPanel from './payment-panel.vue';

const api = vi.hoisted(() => ({
  getOrder: vi.fn(),
  preparePayment: vi.fn(),
  cancelOrder: vi.fn(),
}));
vi.mock('#/api/billing', () => api);
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { userId: '1' } }),
  useAccessStore: () => ({ accessCodes: [] }),
}));
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          h(
            'button',
            { disabled: props.disabled || props.loading },
            slots.default?.(),
          ),
    }),
    QRCode: defineComponent({
      props: { value: { type: String, default: '' } },
      setup: (props) => () => h('div', { 'data-qr': props.value }),
    }),
  };
});

const pending = {
  id: '1',
  channel: 'wechat',
  status: 'pending',
  title: '验收',
  payableMinor: '101',
};
let app: ReturnType<typeof createApp> | undefined;
let root: HTMLDivElement;
const changed = vi.fn();
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await nextTick();
}
function mount() {
  app = createApp({
    render: () => h(PaymentPanel, { orderId: '1', onChanged: changed }),
  });
  app.mount(root);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.append(root);
  api.getOrder.mockResolvedValue(pending);
  api.preparePayment.mockResolvedValue({
    status: 'ready',
    parameters: { codeUrl: 'weixin://fixture' },
  });
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
  vi.useRealTimers();
});

it('展示二维码不标记成功，只有随后查询到服务端 paid 才提示入账', async () => {
  mount();
  await flush();
  expect(root.querySelector<HTMLElement>('[data-qr]')?.dataset.qr).toBe(
    'weixin://fixture',
  );
  expect(changed.mock.calls.map(([order]) => order.status)).toEqual([
    'pending',
  ]);
  api.getOrder.mockResolvedValue({ ...pending, status: 'paid' });
  await vi.advanceTimersByTimeAsync(3000);
  await flush();
  expect(root.textContent).toContain('积分已由服务端确认入账');
  expect(root.querySelector('[data-qr]')).toBeNull();
  expect(api.preparePayment).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('页面离开后迟到查询响应不再发起支付或通知父页面', async () => {
  let finish!: (value: unknown) => void;
  api.getOrder.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount();
  app?.unmount();
  app = undefined;
  finish(pending);
  await flush();
  expect(api.preparePayment).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('支付未配置时保留原订单，暂停查询，取消成功后清除旧错误', async () => {
  api.preparePayment.mockRejectedValue(new Error('渠道尚未配置'));
  api.cancelOrder.mockResolvedValue({ ...pending, status: 'closed' });
  mount();
  await flush();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain(
    '渠道尚未配置',
  );
  expect(vi.getTimerCount()).toBe(0);
  [...root.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '取消订单')
    ?.click();
  await flush();
  expect(api.cancelOrder).toHaveBeenCalledWith('1');
  expect(root.textContent).toContain('已关闭');
  expect(root.querySelector('[role="alert"]')).toBeNull();
});
it('轮询一分钟后停止，手动刷新继续同一订单，不创建新订单', async () => {
  mount();
  await flush();
  await vi.advanceTimersByTimeAsync(61_000);
  await flush();
  expect(root.textContent).toContain('自动查询已暂停');
  expect(vi.getTimerCount()).toBe(0);
  const calls = api.getOrder.mock.calls.length;
  [...root.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '刷新订单')
    ?.click();
  await flush();
  expect(api.getOrder).toHaveBeenCalledTimes(calls + 1);
  expect(api.getOrder.mock.calls.every(([id]) => id === '1')).toBe(true);
});
