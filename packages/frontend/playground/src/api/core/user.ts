import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  const user = await requestClient.get<UserInfo>('/user/info');
  return { ...user, homePath: '/account/points' };
}
