import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attemptKey,
  clearAttempt,
  integer,
  minor,
  money,
  points,
  useTask,
} from '#/views/billing/helpers';

const state = vi.hoisted(() => ({ userInfo: { userId: '9007199254740993' } }));
vi.mock('@vben/stores', () => ({
  useUserStore: () => state,
  useAccessStore: () => ({ accessCodes: [] }),
}));

beforeEach(() => {
  sessionStorage.clear();
  state.userInfo.userId = '9007199254740993';
});
describe('账务整数与重试约束', () => {
  it('超过 JS 安全整数的金额与积分仍精确往返', () => {
    expect(minor('90071992547409.93')).toBe('9007199254740993');
    expect(money('9007199254740993')).toBe('90071992547409.93');
    expect(points('9007199254740993')).toBe('9,007,199,254,740,993');
    expect(integer('9223372036854775807')).toBe('9223372036854775807');
    expect(money(null)).toBe('商店定价');
    expect(points(undefined)).toBe('—');
  });
  it('拒绝非规范整数、溢出与多余小数', () => {
    for (const value of ['01', '-1', '1e2', '1.5', '9223372036854775808'])
      expect(() => integer(value)).toThrow('请输入有效整数');
    for (const value of [
      '1.001',
      '01.00',
      '-1.00',
      '1e2',
      '92233720368547758.08',
    ])
      expect(() => minor(value)).toThrow(/请输入有效整数|金额最多两位小数/);
    expect(() => integer('0', true)).toThrow('请输入有效整数');
    expect(minor('0.01')).toBe('1');
  });
  it('网络重试复用键，成功清除、内容变化及切换用户产生新键', () => {
    const body = { amount: '9007199254740993', reason: '验收' };
    const key = attemptKey('grant', body);
    expect(attemptKey('grant', body)).toBe(key);
    state.userInfo.userId = '2';
    expect(attemptKey('grant', body)).not.toBe(key);
    state.userInfo.userId = '9007199254740993';
    expect(attemptKey('grant', body)).toBe(key);
    clearAttempt('grant');
    expect(attemptKey('grant', body)).not.toBe(key);
    expect(attemptKey('grant', { ...body, amount: '1' })).not.toBe(
      attemptKey('grant', body),
    );
  });
  it('同一任务拒绝并发提交，失败保留可重试错误', async () => {
    const task = useTask();
    let release!: (value: string) => void;
    const pending = task.run(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const duplicate = vi.fn();
    await task.run(duplicate);
    expect(duplicate).not.toHaveBeenCalled();
    release('ok');
    expect(await pending).toBe('ok');
    await task.run(async () => {
      throw new Error('超时');
    });
    expect(task.error.value).toBe('超时');
    expect(task.busy.value).toBe(false);
  });
});
