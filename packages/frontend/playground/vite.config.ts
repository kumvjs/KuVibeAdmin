import process from 'node:process';

import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: { nitroMock: false },
    vite: {
      build: { target: 'es2020' },
      server: {
        watch: { usePolling: true },
        proxy: {
          '/api': {
            changeOrigin: true,
            // 保留真实后端/api前缀；Docker通过服务名访问，宿主默认开发端口。
            target: process.env.VITE_BACKEND_PROXY || 'http://127.0.0.1:17001',
            ws: true,
          },
        },
      },
    },
  };
});
