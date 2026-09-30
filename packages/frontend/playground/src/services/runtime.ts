import type { CreateClientConfig } from './generated/client.gen';

import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import axios from 'axios';

// 保留 AxiosResponse，生成 SDK 依赖它；业务解包统一交给 apiRequest。
const instance = axios.create();
instance.interceptors.request.use((config) => {
  const token = useAccessStore().accessToken;
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  config.headers.set('Accept-Language', preferences.app.locale);
  return config;
});

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  axios: instance,
  baseURL: import.meta.env.VITE_KUVIBE_API_URL || '/api',
  throwOnError: true,
  withCredentials: true,
});
