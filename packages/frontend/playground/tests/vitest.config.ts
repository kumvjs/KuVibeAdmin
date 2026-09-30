import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vitest/config';

import upstreamConfig from '../../vitest.config.ts';

// 应用测试继承Vben通用配置，仅补充业务别名和用例范围。
export default mergeConfig(
  upstreamConfig,
  defineConfig({
    resolve: {
      alias: { '#': fileURLToPath(new URL('../src', import.meta.url)) },
    },
    test: {
      include: ['playground/tests/**/*.test.ts'],
    },
  }),
);
