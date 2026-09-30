import type { AxiosResponse } from 'axios';

import { describe, expect, expectTypeOf, it, vi } from 'vitest';

vi.mock('@vben/preferences', () => ({ preferences: { app: { locale: 'zh-CN' } } }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => ({ accessToken: 'test-token' }) }));

import { ApiBusinessError, apiRequest } from './api-request';
import { client } from './generated/client.gen';
import { authLogin, authRefresh, deptRemove, userInfo } from './generated';

const envelope = (data: unknown) => ({ code: 0, data, message: 'success', success: true, traceId: 'trace' });

describe('独立 OpenAPI 客户端', () => {
  it('生成 SDK 使用配置地址、Cookie、Bearer 与 locale，正确解包', async () => {
    client.setConfig({
      baseURL: 'https://backend.example/api',
      adapter: async (config) => {
        expect(config.baseURL).toBe('');
        expect(config.url).toBe('https://backend.example/api/auth/login');
        expect(config.withCredentials).toBe(true);
        expect(config.headers.get('Authorization')).toBe('Bearer test-token');
        expect(config.headers.get('Accept-Language')).toBe('zh-CN');
        expect(JSON.parse(config.data)).toEqual({ username: 'admin', password: 'test-password' });
        return { config, data: envelope({ accessToken: 'new-token' }), headers: {}, status: 201, statusText: 'Created' };
      },
    });
    const result = await apiRequest(authLogin, { body: { username: 'admin', password: 'test-password' } });
    expectTypeOf(result.accessToken).toEqualTypeOf<string>();
    expect(result).toEqual({ accessToken: 'new-token' });
  });

  it('拒绝业务错误并保留追踪编号，原始响应不被错误解包', async () => {
    const method = async () => ({ data: { code: 20004, data: null, message: '账号停用', traceId: 'trace' } }) as AxiosResponse;
    await expect(apiRequest(method)).rejects.toMatchObject({ code: 20004, traceId: 'trace' });
    await expect(apiRequest(method)).rejects.toBeInstanceOf(ApiBusinessError);
    const blob = new Blob(['download']);
    expect(await apiRequest(async () => ({ data: blob }) as AxiosResponse<Blob>)).toBe(blob);
    expect(await apiRequest(async () => ({ data: envelope(false) }) as AxiosResponse)).toBe(false);
  });

  it('HTTP 错误保持拒绝，不转换为成功数据', async () => {
    const error = new Error('HTTP 401');
    client.setConfig({ adapter: async () => { throw error; } });
    await expect(apiRequest(userInfo)).rejects.toBe(error);
  });
});

function checkTypes() {
  // @ts-expect-error 登录必须提供 body
  apiRequest(authLogin);
  // @ts-expect-error 删除必须提供路径 id
  apiRequest(deptRemove, {});
  const result = apiRequest(authRefresh);
  expectTypeOf<Awaited<typeof result>['accessToken']>().toEqualTypeOf<string>();
}
void checkTypes;
