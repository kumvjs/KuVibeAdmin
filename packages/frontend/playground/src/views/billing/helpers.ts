import { ref } from 'vue';

import { useAccessStore, useUserStore } from '@vben/stores';

import './billing.css';

const maximum = 9_223_372_036_854_775_807n;
export function integer(value: string, positive = false) {
  if (
    !/^(0|[1-9]\d*)$/.test(value) ||
    BigInt(value) > maximum ||
    (positive && value === '0')
  )
    throw new Error('请输入有效整数，不能超过积分支持范围');
  return value;
}
export function points(value: null | string | undefined) {
  if (value === null || value === undefined) return '—';
  return BigInt(value).toLocaleString('zh-CN');
}
export function money(value: null | string | undefined) {
  if (value === null || value === undefined) return '商店定价';
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
export function minor(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new Error('金额最多两位小数');
  const [whole = '0', fraction = ''] = value.split('.');
  return integer(
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString(),
  );
}
export const channels = {
  alipay: '支付宝',
  apple: 'Apple 内购',
  google: 'Google 内购',
  wechat: '微信支付',
};
export const statuses = {
  closed: '已关闭',
  closing: '关闭确认中',
  paid: '支付成功',
  pending: '待支付',
  refund_pending: '退款处理中',
  refunded: '已退款',
  review: '人工核查中',
};
export const actions: Record<string, string> = {
  capture: '核销',
  debit: '扣减',
  freeze: '冻结',
  grant: '增加',
  reverse: '冲正',
  unfreeze: '解冻',
};
export function time(value: null | string | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}
export function errorText(error: unknown) {
  const e = error as {
    message?: string;
    response?: { data?: { message?: string } };
  };
  return e.response?.data?.message || e.message || '请求失败，请稍后重试';
}
export function useTask() {
  const busy = ref(false);
  const failure = ref('');
  async function run<T>(fn: () => Promise<T>) {
    if (busy.value) return;
    busy.value = true;
    failure.value = '';
    try {
      return await fn();
    } catch (error) {
      failure.value = errorText(error);
      return undefined;
    } finally {
      busy.value = false;
    }
  }
  return { busy, error: failure, run };
}
export const can = (code: string) =>
  useAccessStore().accessCodes.includes(code);

// 同内容超时重试保留原键；按当前用户隔离，不保存支付凭据或令牌。
export function attemptKey(scope: string, body: Record<string, unknown>) {
  const key = `billing:${useUserStore().userInfo?.userId}:${scope}`;
  const fingerprint = JSON.stringify(body);
  const old = sessionStorage.getItem(key);
  if (old) {
    const parsed = JSON.parse(old) as { fingerprint: string; key: string };
    if (parsed.fingerprint === fingerprint) return parsed.key;
  }
  const attempt = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ fingerprint, key: attempt }));
  return attempt;
}
export function clearAttempt(scope: string) {
  sessionStorage.removeItem(
    `billing:${useUserStore().userInfo?.userId}:${scope}`,
  );
}
