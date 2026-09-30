import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth';

const mocks = vi.hoisted(() => ({
  access: {
    accessToken: null as null | string,
    loginExpired: false,
    setLoginExpired: vi.fn(),
  },
  logout: vi.fn(),
  reset: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: mocks.replace,
    currentRoute: {
      value: { path: '/account/points', fullPath: '/account/points' },
    },
  }),
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => mocks.access,
  useUserStore: () => ({}),
  resetAllStores: mocks.reset,
}));
vi.mock('#/api', () => ({
  logoutApi: mocks.logout,
  loginApi: vi.fn(),
  getUserInfoApi: vi.fn(),
  getAccessCodesApi: vi.fn(),
}));
vi.mock('#/locales', () => ({ $t: (value: string) => value }));
vi.mock('antdv-next', () => ({ notification: { success: vi.fn() } }));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { defaultHomePath: '/account/points' } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  mocks.access.accessToken = null;
});
it('刷新失败清除token后退出，不再发起可能进入刷新队列的鉴权请求', async () => {
  await useAuthStore().logout();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.reset).toHaveBeenCalledTimes(1);
  expect(mocks.replace).toHaveBeenCalled();
});
it('正常退出仍撤销服务端会话；网络失败也清理本地状态', async () => {
  mocks.access.accessToken = 'fixture';
  mocks.logout.mockRejectedValue(new Error('超时'));
  await useAuthStore().logout();
  expect(mocks.logout).toHaveBeenCalledTimes(1);
  expect(mocks.reset).toHaveBeenCalledTimes(1);
  expect(mocks.replace).toHaveBeenCalled();
});
