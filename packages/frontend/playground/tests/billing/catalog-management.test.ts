/* eslint-disable vue/one-component-per-file -- 组件替身仅用于验证业务选择、回显和提交契约。 */
import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Packages from '#/views/system/billing/packages.vue';
import Promotions from '#/views/system/billing/promotions.vue';

const api = vi.hoisted(() => ({
  getPackages: vi.fn(), getPromotions: vi.fn(), getPackageDetail: vi.fn(),
  savePromotion: vi.fn(), saveProduct: vi.fn(), savePackage: vi.fn(),
  publishPackage: vi.fn(), publishPromotion: vi.fn(), issueCoupon: vi.fn(),
}));
vi.mock('#/api/billing', () => api);
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { userId: '1' } }),
  useAccessStore: () => ({ accessCodes: ['system:billing:promotion:write', 'system:billing:catalog:write'] }),
}));
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    message: { success: vi.fn() },
    Modal: defineComponent({
      props: { open: Boolean, title: { type: String, default: '' } },
      setup: (props, { slots }) => () => props.open ? h('section', { 'data-modal': '' }, [h('h2', props.title), slots.default?.()]) : null,
    }),
    Button: defineComponent({
      props: { htmlType: { type: String, default: 'button' } },
      setup: (props, { slots }) => () => h('button', { type: props.htmlType ?? 'button' }, slots.default?.()),
    }),
    Select: defineComponent({
      props: { value: { type: Array, default: () => [] }, options: { type: Array, default: () => [] } },
      emits: ['update:value'],
      setup: (props, { emit }) => () => h('select', {
        multiple: true,
        value: props.value,
        onChange: (event: Event) => emit('update:value', [...(event.target as HTMLSelectElement).selectedOptions].map((option) => option.value)),
      }, (props.options ?? []).map((option: { label: string; value: string }) => h('option', { value: option.value }, option.label))),
    }),
  };
});
const bigId = '9007199254740993';
const rechargePackage = { id: bigId, versionId: '9007199254740995', revision: 2, title: '月度套餐', code: 'monthly', status: 'disabled', priceMinor: '100', basePoints: '100', giftPoints: '0' };
const promotion = { id: '8', title: '测试赠送', code: 'test', effect: 'bonus_fixed', value: '10', channels: ['wechat'], packageIds: [bigId], eligibility: 'always', minimumMinor: '0', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' };
let app: ReturnType<typeof createApp>;
let root: HTMLDivElement;
async function flush() {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick(); }
}
async function mount(component: typeof Packages | typeof Promotions) {
  app = createApp(component);
  app.mount(root);
  await flush();
}
async function click(text: string) {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`按钮缺失：${text}`);
  button.click();
  await flush();
}
function field(label: string) {
  const element = [...root.querySelectorAll('.billing-field')].find((item) => item.firstElementChild?.textContent?.startsWith(label));
  if (!element) throw new Error(`字段缺失：${label}`);
  return element;
}
async function submit() {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
}
beforeEach(() => {
  vi.resetAllMocks();
  api.getPackages.mockResolvedValue({ items: [{ ...rechargePackage, products: [] }], total: 1 });
  api.getPromotions.mockResolvedValue({ items: [promotion], total: 1 });
  api.getPackageDetail.mockResolvedValue({ ...rechargePackage, products: [] });
  api.savePromotion.mockResolvedValue({ id: '8' });
  api.saveProduct.mockResolvedValue({ id: '9' });
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => { app?.unmount(); root.remove(); });

it('新建活动加载全部分页套餐，展示草稿/下架名称与标识，使用多选下拉', async () => {
  await mount(Promotions);
  api.getPackages.mockResolvedValueOnce({ items: [rechargePackage], total: 101 }).mockResolvedValueOnce({ items: [{ ...rechargePackage, id: '10', title: '草稿套餐', status: 'draft' }], total: 101 });
  await click('新增活动');
  expect(api.getPackages).toHaveBeenNthCalledWith(1, { page: 1, limit: 100 }, true);
  expect(api.getPackages).toHaveBeenNthCalledWith(2, { page: 2, limit: 100 }, true);
  const selector = field('适用套餐').querySelector('select')!;
  expect(selector.multiple).toBe(true);
  expect(selector.textContent).toContain('月度套餐 · monthly');
  expect(selector.textContent).toContain('已下架');
  expect(selector.textContent).toContain('草稿套餐');
  expect(field('适用套餐').querySelector('input')).toBeNull();
});
it('编辑活动回显已有套餐，多选按字符串数组提交，清空普通活动表示全部套餐', async () => {
  await mount(Promotions);
  await click('新版本');
  const selector = field('适用套餐').querySelector('select')!;
  expect([...selector.selectedOptions].map((item) => item.value)).toEqual([bigId]);
  await submit();
  expect(api.savePromotion).toHaveBeenLastCalledWith(expect.objectContaining({ packageIds: [bigId] }), '8');
  await click('新版本');
  const empty = field('适用套餐').querySelector('select')!;
  [...empty.options].forEach((option) => { option.selected = false; });
  empty.dispatchEvent(new Event('change', { bubbles: true }));
  await submit();
  expect(api.savePromotion).toHaveBeenLastCalledWith(expect.objectContaining({ packageIds: [] }), '8');
});
it('连续充值活动未选择套餐时阻止提交', async () => {
  api.getPromotions.mockResolvedValue({ items: [{ ...promotion, effect: 'bonus_consecutive', packageIds: [], maxConsecutiveDays: 1, dailyBonusPoints: ['5'] }], total: 1 });
  await mount(Promotions);
  await click('新版本');
  await submit();
  expect(api.savePromotion).not.toHaveBeenCalled();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('请选择适用套餐');
});
it('套餐读取失败保留错误并可重试；历史缺失套餐不会静默丢失', async () => {
  await mount(Promotions);
  api.getPackages.mockRejectedValueOnce(new Error('网络异常'));
  await click('新版本');
  expect(root.textContent).toContain('套餐加载失败');
  expect(root.querySelector('[data-modal]')).toBeNull();
  api.getPackages.mockResolvedValueOnce({ items: [], total: 0 });
  await click('新版本');
  expect(field('适用套餐').textContent).toContain(`套餐 #${bigId}（当前不可用）`);
  await submit();
  expect(api.savePromotion).toHaveBeenCalledWith(expect.objectContaining({ packageIds: [bigId] }), '8');
});
it.each([['添加 iOS 内购商品', 'apple'], ['添加 Google Play 商品', 'google']])('套餐内%s默认商店正确，自动绑定所选版本并刷新商品列表', async (button, channel) => {
  await mount(Packages);
  await click('iOS / Google Play');
  expect(api.getPackageDetail).toHaveBeenCalledWith(rechargePackage.id);
  await click(button);
  expect(field('商店').querySelector('select')!.value).toBe(channel);
  expect(root.textContent).not.toContain('套餐版本ID');
  const application = field('应用ID').querySelector('input')!;
  application.value = 'com.example.app';
  application.dispatchEvent(new Event('input', { bubbles: true }));
  const product = field('内购商品 ID').querySelector('input')!;
  product.value = 'monthly.points';
  product.dispatchEvent(new Event('input', { bubbles: true }));
  await submit();
  expect(api.saveProduct).toHaveBeenCalledWith({ versionId: rechargePackage.versionId, channel, applicationId: 'com.example.app', environment: 'sandbox', productId: 'monthly.points' });
  expect(api.getPackageDetail).toHaveBeenCalledTimes(2);
});
