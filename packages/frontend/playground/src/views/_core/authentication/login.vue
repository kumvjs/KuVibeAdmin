<script setup lang="ts">
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { AuthenticationLogin, z } from '@vben/common-ui';

import { useAuthStore } from '#/store';

const authStore = useAuthStore();
const formSchema: VbenFormSchema[] = [
  {
    component: 'VbenInput',
    componentProps: { autocomplete: 'username', placeholder: '请输入账号' },
    fieldName: 'username',
    label: '账号',
    rules: z.string().min(1, '请输入账号'),
  },
  {
    component: 'VbenInputPassword',
    componentProps: {
      autocomplete: 'current-password',
      placeholder: '请输入密码',
    },
    fieldName: 'password',
    label: '密码',
    rules: z.string().min(1, '请输入密码'),
  },
];
async function onSubmit(params: Recordable<unknown>) {
  try {
    await authStore.authLogin(params);
  } catch {
    /* 统一请求拦截器展示错误，保留表单以便重试。 */
  }
}
</script>
<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-qrcode-login="false"
    :show-third-party-login="false"
    :show-register="false"
    :show-forget-password="false"
    @submit="onSubmit"
  />
</template>
