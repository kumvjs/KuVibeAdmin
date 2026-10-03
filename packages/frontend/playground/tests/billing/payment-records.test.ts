/* eslint-disable vue/one-component-per-file -- 表单替身验证业务核查流程与权限。 */
import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Payments from '#/views/system/billing/payments.vue';

const fixture = vi.hoisted(() => ({ getPaymentRecords: vi.fn(), bindPaymentRecord: vi.fn(), recheckPaymentRecord: vi.fn(), codes: [] as string[] }));
vi.mock('#/api/billing', () => fixture);
vi.mock('@vben/stores', () => ({ useUserStore: () => ({ userInfo: { userId: '1' } }), useAccessStore: () => ({ accessCodes: fixture.codes }) }));
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    message: { success: vi.fn() },
    Modal: defineComponent({ props: { open: Boolean }, setup: (props, { slots }) => () => props.open ? h('section', slots.default?.()) : null }),
    Button: defineComponent({ props: { htmlType: { type: String, default: 'button' } }, setup: (props, { slots }) => () => h('button', { type: props.htmlType }, slots.default?.()) }),
    Select: defineComponent({ setup: () => () => h('select') }),
  };
});
const row = { id: '9007199254740993', channel: 'apple', orderId: null, platformState: 'paid', status: 'unmatched', transactionKey: 'apple:production:test.app:123', productId: 'price_9_9', applicationId: 'test.app', environment: 'production', quantity: '1', amountMinor: null, currency: 'CNY', platformAmount: { value: '9900', scale: 3, currency: 'CNY', source: 'apple_transaction' } };
let app: ReturnType<typeof createApp>;
let root: HTMLDivElement;
async function flush() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick(); } }
async function mount() { app = createApp(Payments); app.mount(root); await flush(); }
async function click(text: string) { const button = [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === text); if (!button) throw new Error(`缺少按钮${text}`); button.click(); await flush(); }
async function submit() { root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); }
function fill(label: string, value: string) { const field = [...root.querySelectorAll('.billing-field')].find((item) => item.firstElementChild?.textContent?.startsWith(label))!; const input = field.querySelector('input,textarea') as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
beforeEach(() => { vi.resetAllMocks(); fixture.codes = ['system:billing:payment:bind', 'system:billing:payment:recheck']; fixture.getPaymentRecords.mockResolvedValue({ items: [row], nextCursor: null }); root = document.createElement('div'); document.body.append(root); });
afterEach(() => { app?.unmount(); root.remove(); });

it('未关联交易展示平台原始精度金额，未知金额不使用套餐价', async () => {
  fixture.getPaymentRecords.mockResolvedValue({ items: [row, { ...row, id: '2', platformAmount: { value: '123000000001', scale: 9, currency: 'JPY', source: 'google_order' } }, { ...row, id: '3', platformAmount: null }], nextCursor: null });
  await mount();
  expect(root.textContent).toContain('9.9 CNY');
  expect(root.textContent).toContain('123.000000001 JPY');
  expect(root.textContent).toContain('平台金额未提供 / 待补查');
  expect(root.textContent).toContain('尚未关联订单');
  expect(fixture.getPaymentRecords).toHaveBeenCalledWith(expect.objectContaining({ status: 'unmatched' }));
});
it('人工关联必须填核查依据，以字符串订单ID提交，再等待后台验真', async () => {
  await mount(); await click('人工关联订单');
  fill('经核实的业务订单 ID', '9007199254740995');
  await submit();
  expect(fixture.bindPaymentRecord).not.toHaveBeenCalled();
  fill('操作原因', '客服核对订单与平台付款凭证');
  await submit();
  expect(fixture.bindPaymentRecord).toHaveBeenCalledWith(row.id, { orderId: '9007199254740995', reason: '客服核对订单与平台付款凭证' });
});
it('无处置权限只查看', async () => {
  fixture.codes = [];
  await mount();
  expect(root.textContent).not.toContain('人工关联订单');
  expect(root.textContent).not.toContain('重新验真');
});
it('已关联交易不能再次人工关联', async () => {
  fixture.getPaymentRecords.mockResolvedValue({ items: [{ ...row, orderId: '10', status: 'fulfilled' }], nextCursor: null });
  await mount();
  expect(root.textContent).not.toContain('人工关联订单');
  expect(root.textContent).toContain('订单 #10');
});
