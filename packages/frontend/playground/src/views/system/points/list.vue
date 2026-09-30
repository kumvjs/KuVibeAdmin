<script setup lang="ts">
import type { PointAccount, PointLedger } from '#/api/billing';
import type { Field } from '#/views/billing/form-editor.vue';

import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Button, message } from 'antdv-next';

import { getPointAccount, getPointLedger, mutatePoints } from '#/api/billing';
import { reasonField } from '#/views/billing/fields';
import FormEditor from '#/views/billing/form-editor.vue';
import {
  actions,
  attemptKey,
  can,
  clearAttempt,
  integer,
  points,
  useTask,
} from '#/views/billing/helpers';
import LedgerTable from '#/views/billing/ledger-table.vue';

const route = useRoute();
const userId = ref('');
const loadedUser = ref('');
const account = ref<PointAccount>();
const rows = ref<PointLedger[]>([]);
const next = ref<null | string>(null);
const action = ref('grant');
const editor = ref(false);
const { busy, error, run } = useTask();
const fields = computed<Field[]>(() => [
  {
    key: 'amount',
    label: '操作积分数量',
    type: 'integer',
    positive: true,
    required: true,
  },
  ...(action.value === 'grant'
    ? [
        {
          key: 'kind',
          label: '积分来源',
          type: 'select',
          default: 'gift',
          options: [
            { value: 'gift', label: '赠分' },
            { value: 'paid', label: '基础积分' },
          ],
        } as Field,
      ]
    : []),
  ...(['capture', 'unfreeze'].includes(action.value)
    ? [
        {
          key: 'holdId',
          label: '冻结凭证ID',
          type: 'integer',
          positive: true,
          required: true,
        } as Field,
      ]
    : []),
  ...(action.value === 'reverse'
    ? [
        {
          key: 'referenceId',
          label: '原流水ID',
          type: 'integer',
          positive: true,
          required: true,
        } as Field,
      ]
    : []),
  reasonField,
]);
async function load(more = false) {
  await run(async () => {
    const target = more ? loadedUser.value : integer(userId.value.trim(), true);
    const [balance, page] = await Promise.all([
      getPointAccount(target),
      getPointLedger(
        { cursor: more ? next.value || undefined : undefined, limit: 20 },
        target,
      ),
    ]);
    account.value = balance;
    loadedUser.value = target;
    rows.value = more ? [...rows.value, ...page.items] : page.items;
    next.value = page.nextCursor;
  });
}
async function commit(body: Record<string, unknown>) {
  const scope = `points:${loadedUser.value}:${action.value}`;
  const result = await mutatePoints(loadedUser.value, action.value, {
    ...body,
    idempotencyKey: attemptKey(scope, body),
  });
  clearAttempt(scope);
  message.success(`已${actions[action.value]}积分，流水 #${result.id}`);
  window.dispatchEvent(new Event('billing:balance-updated'));
  return result;
}
watch(
  () => route.query.userId,
  (value) => {
    if (typeof value === 'string') {
      userId.value = value;
      void load();
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="billing-page">
    <header>
      <h1>积分管理</h1>
      <p class="billing-muted">
        按用户查看账户与流水，所有调整保留操作人、原因及凭证。
      </p>
    </header>
    <form class="billing-panel billing-actions" @submit.prevent="load()">
      <label>用户ID
        <input
          v-model="userId"
          class="billing-input billing-filter"
          required
          inputmode="numeric"
          placeholder="用户ID"
/></label><Button
        type="primary"
        html-type="submit"
        :loading="busy"
        :disabled="!can('system:points:read')"
        >
查询账户
</Button>
    </form>
    <p v-if="error" class="billing-error" role="alert">{{ error }}</p>
    <template v-if="account">
<div class="billing-grid">
        <div class="billing-metric">
          <p class="billing-muted">用户 #{{ loadedUser }} · 可用积分</p>
          <div class="billing-value">{{ points(account.available) }}</div>
        </div>
        <div class="billing-metric">
          <p class="billing-muted">冻结积分</p>
          <div class="billing-value">{{ points(account.frozen) }}</div>
        </div>
        <div class="billing-metric">
          <p class="billing-muted">账户状态</p>
          <div class="billing-value">
            {{ account.status === 'active' ? '正常' : '消费受限' }}
          </div>
        </div>
      </div>
      <section class="billing-panel">
        <div class="billing-actions mb-5">
          <Button
            v-for="(label, key) in actions"
            v-show="can(`system:points:${key}`)"
            :key="key"
            :disabled="busy"
            :danger="key === 'debit' || key === 'capture'"
            @click="
              action = key;
              editor = true;
            "
            >
{{ label }}积分
</Button>
        </div>
        <LedgerTable :rows="rows" />
        <div class="billing-footer">
          <Button v-if="next" :loading="busy" @click="load(true)">
加载更多
</Button>
        </div>
      </section>
    </template>
    <FormEditor
      v-model:open="editor"
      :title="`${actions[action]}积分 · 用户 #${loadedUser}`"
      :fields="fields"
      :commit="commit"
      notice="扣减、核销及冲正会改变权益。冲正仅支持完整原发放/扣减；充值发放及退款冻结须通过退款流程处理。网络失败请保持原内容重试。"
      @saved="load()"
    />
  </div>
</template>
