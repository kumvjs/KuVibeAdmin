import { fileURLToPath } from 'node:url';

import Vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [Vue()],
  resolve: {
    alias: { '#': fileURLToPath(new URL('playground/src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    include: [
      'playground/src/views/billing/*.test.ts',
      'playground/src/api/core/auth.test.ts',
      'playground/src/store/auth.test.ts',
    ],
  },
});
