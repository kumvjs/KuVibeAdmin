import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
  }

  export interface RefreshTokenResult {
    data: { accessToken: string };
    success: boolean;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>(
    '/auth/login',
    { username: data.username, password: data.password },
    {
      withCredentials: true,
    },
  );
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  const response =
    await baseRequestClient.instance.post<AuthApi.RefreshTokenResult>(
      '/auth/refresh',
      null,
      {
        withCredentials: true,
      },
    );
  return response.data;
}

/**
 * 退出登录
 */
export async function logoutApi() {
  return requestClient.post('/auth/logout', null, {
    withCredentials: true,
  });
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}
