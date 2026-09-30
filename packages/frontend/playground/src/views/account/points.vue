<script setup lang="ts">
import type { PointAccount, PointLedger } from '#/api/billing';

import { onActivated, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button } from 'antdv-next';

import { getPointAccount, getPointLedger } from '#/api/billing';
import { points, useTask } from '#/views/billing/helpers';
import LedgerTable from '#/views/billing/ledger-table.vue';

const account = ref<PointAccount>();
const rows = ref<PointLedger[]>([]);
const next = ref<null | string>(null);
const { busy, error, run } = useTask();
const router = useRouter();
async function load(more = false) {
  await run(async () => {
    const [balance, page] = await Promise.all([
      getPointAccount(),
      getPointLedger({
        cursor: more ? next.value || undefined : undefined,
        limit: 20,
      }),
    ]);
    account.value = balance;
    rows.value = more ? [...rows.value, ...page.items] : page.items;
    next.value = page.nextCursor;
  });
}
onMounted(() => load());
onActivated(() => load());
</script>
<template>
  <div class="billing-page">
    <header class="billing-toolbar">
      <div>
        <h1>我的积分</h1>
        <p class="billing-muted">每一笔变化都有记录，积分不可提现。</p>
      </div>
      <div class="billing-actions">
        <Button :loading="busy" @click="load()">刷新</Button><Button @click="router.push('/account/orders')">历史订单</Button><Button type="primary" @click="router.push('/account/recharge')">
          充值积分
        </Button>
      </div>
    </header>
    <p v-if="error" role="alert" class="billing-error">
      {{ error }} · 显示的是上次成功查询的数据
    </p>
    <div class="billing-grid">
      <div class="billing-metric">
        <p class="billing-muted">可用积分</p>
        <div class="billing-value">{{ points(account?.available) }}</div>
      </div>
      <div class="billing-metric">
        <p class="billing-muted">冻结积分</p>
        <div class="billing-value">{{ points(account?.frozen) }}</div>
      </div>
      <div class="billing-metric">
        <p class="billing-muted">账户状态</p>
        <div class="billing-value">
          {{
            account ? (account.status === 'active' ? '正常' : '消费受限') : '—'
          }}
        </div>
      </div>
    </div>
    <p v-if="account?.status === 'blocked'" class="billing-error">
      账户有待处理的账务风险，积分消费暂受限制，请联系管理员。
    </p>
    <section class="billing-panel">
      <h2>积分流水</h2>
      <LedgerTable :rows="rows" />
      <div class="billing-footer">
        <Button v-if="next" :loading="busy" @click="load(true)">加载更多</Button><span v-else-if="rows.length" class="billing-muted">已显示全部流水</span>
      </div>
    </section>
  </div>
</template>
