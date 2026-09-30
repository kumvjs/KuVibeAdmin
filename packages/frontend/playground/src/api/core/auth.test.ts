import { beforeEach, expect, it, vi } from 'vitest';

import { loginApi, logoutApi, refreshTokenApi } from './auth';

const client = vi.hoisted(() => ({
  rawPost: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
}));
vi.mock('#/api/request', () => ({
  baseRequestClient: { instance: { post: client.rawPost } },
  requestClient: { post: client.post, get: client.get },
}));

beforeEach(() => vi.clearAllMocks());
it('刷新读取原始 Axios 响应中的真实业务 envelope，并携带 HttpOnly Cookie', async () => {
  client.rawPost.mockResolvedValue({
    data: { success: true, data: { accessToken: 'rotated' } },
    status: 200,
  });
  expect(await refreshTokenApi()).toEqual({
    success: true,
    data: { accessToken: 'rotated' },
  });
  expect(client.rawPost).toHaveBeenCalledWith('/auth/refresh', null, {
    withCredentials: true,
  });
});
it('登录只提交后端 DTO 支持字段，退出使用带 Bearer 的客户端', async () => {
  await loginApi({ username: 'user', password: 'fixture' });
  expect(client.post).toHaveBeenCalledWith(
    '/auth/login',
    { username: 'user', password: 'fixture' },
    { withCredentials: true },
  );
  await logoutApi();
  expect(client.post).toHaveBeenCalledWith('/auth/logout', null, {
    withCredentials: true,
  });
  expect(client.rawPost).not.toHaveBeenCalled();
});
