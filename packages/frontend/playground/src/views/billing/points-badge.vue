<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button } from 'antdv-next';

import { getPointAccount } from '#/api/billing';

import { points } from './helpers';

const balance = ref<string>();
const error = ref(false);
const router = useRouter();
let alive = true;
async function load() {
  try {
    const account = await getPointAccount();
    if (alive) {
      balance.value = account.available;
      error.value = false;
    }
  } catch {
    if (alive) error.value = true;
  }
}
const unsubscribe = router.afterEach(() => void load());
onMounted(() => {
  void load();
  window.addEventListener('billing:balance-updated', load);
});
onBeforeUnmount(() => {
  alive = false;
  unsubscribe();
  window.removeEventListener('billing:balance-updated', load);
});
</script>
<template>
  <Button type="text" @click="router.push('/account/points')">
    {{ error ? '查看积分' : `积分 ${points(balance)}` }}
  </Button>
</template>
