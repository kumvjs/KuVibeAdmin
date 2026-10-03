<script setup lang="ts">
import type { Body, PaymentRecord } from '#/api/billing';
import type { Field } from '#/views/billing/form-editor.vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { Button, message } from 'antdv-next';

import { bindPaymentRecord, getPaymentRecords, recheckPaymentRecord } from '#/api/billing';
import { reasonField } from '#/views/billing/fields';
import FormEditor from '#/views/billing/form-editor.vue';
import { can, channels, time, useTask } from '#/views/billing/helpers';

const rows = ref<PaymentRecord[]>([]);
const next = ref<null | string>(null);
const filters = reactive({ channel: '', status: 'unmatched', transactionKey: '' });
let applied = { ...filters };
const selected = ref<PaymentRecord>();
const editor = ref(false);
const operation = ref<'bind' | 'recheck'>('recheck');
const { busy, error, run } = useTask();
const labels = { fulfilled: '已履约', matched: '已关联待处理', review: '待核查', unmatched: '未关联订单' };
const platformLabels = { closed: '平台取消', paid: '平台已付款', pending: '平台待付款', refunded: '平台退款/撤销' };
const reasons: Record<string, string> = {
  expired_pending_purchase: '预占到期待付款',
  late_payment_after_local_close: '订单关闭后的付款',
  missing_store_order_binding: '缺少可靠订单绑定',
  multiple_transactions_for_order: '订单存在多笔交易',
  payment_binding_mismatch: '商品或归属校验不匹配',
  store_event_requires_manual_review: '商店事件需核查',
  transaction_already_bound: '交易已关联其他订单',
};
const fields = computed<Field[]>(() => operation.value === 'bind'
  ? [{ key: 'orderId', label: '经核实的业务订单 ID', type: 'integer', required: true, hint: '有效、未入账且名额未释放的订单；不会自动创建订单。' }, reasonField]
  : [reasonField]);

function amount(row: PaymentRecord) {
  const store = row.platformAmount;
  if (store) {
    const divisor = 10n ** BigInt(store.scale);
    const value = BigInt(store.value);
    const fraction = (value % divisor).toString().padStart(store.scale, '0').replace(/0+$/, '');
    return `${value / divisor}${fraction ? `.${fraction}` : ''} ${store.currency}`;
  }
  if (row.amountMinor !== null)
    return `${BigInt(row.amountMinor) / 100n}.${(BigInt(row.amountMinor) % 100n).toString().padStart(2, '0')} ${row.currency || ''}`;
  return '平台金额未提供 / 待补查';
}

async function load(append = false) {
  if (!append) applied = { ...filters };
  await run(async () => {
    const result = await getPaymentRecords({
      channel: applied.channel || undefined,
      cursor: append ? next.value ?? undefined : undefined,
      limit: 20,
      status: applied.status || undefined,
      transactionKey: applied.transactionKey || undefined,
    });
    rows.value = append ? [...rows.value, ...result.items] : result.items;
    next.value = result.nextCursor;
  });
}
function operate(mode: 'bind' | 'recheck', row: PaymentRecord) {
  selected.value = row;
  operation.value = mode;
  editor.value = true;
}
async function commit(data: Body) {
  const row = selected.value;
  if (!row) throw new Error('请选择平台流水');
  if (operation.value === 'bind') await bindPaymentRecord(row.id, data);
  else await recheckPaymentRecord(row.id, String(data.reason));
}
async function saved() {
  message.success('核查操作已提交，请刷新查看验真与履约结果');
  await load();
}
onMounted(() => load());
</script>

<template>
  <div class="billing-page">
    <div class="billing-heading"><h1>平台支付流水</h1></div>
    <p class="billing-muted">
      平台付款与业务履约分别记录。未关联或待核查的付款不自动创建订单、不发积分；商店商品 ID 不能确定业务套餐。
      Google 未确认付款可能按平台规则自动退款，内购退款由商店处理。
    </p>
    <div class="billing-toolbar">
      <select v-model="filters.channel" aria-label="支付渠道"><option value="">全部渠道</option><option v-for="(label, key) in channels" :key="key" :value="key">{{ label }}</option></select>
      <select v-model="filters.status" aria-label="关联状态"><option value="">全部关联状态</option><option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option></select>
      <input v-model.trim="filters.transactionKey" placeholder="平台交易键（精确查询）" aria-label="平台交易键" />
      <Button :loading="busy" @click="load()">查询 / 刷新</Button>
    </div>
    <p v-if="error" class="billing-error" role="alert">{{ error }}</p>
    <div class="billing-table-wrap">
      <table class="billing-table">
        <thead><tr><th>平台交易</th><th>商品 / 环境</th><th>平台状态</th><th>业务关联 / 履约</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="wrap">#{{ row.id }} · {{ channels[row.channel] }}<br />{{ row.transactionKey }}</td>
            <td class="wrap">{{ row.productId || '—' }}<br />{{ row.applicationId }} · {{ row.environment }}<br />数量 {{ row.quantity }}</td>
            <td>{{ platformLabels[row.platformState] }}<br />{{ amount(row) }}</td>
            <td class="wrap">{{ labels[row.status] }} · {{ row.orderId ? `订单 #${row.orderId}` : '尚未关联订单' }}<br />{{ row.reason ? reasons[row.reason] || row.reason : '' }}<span v-if="row.manualBinding"><br />人工核实 #{{ row.manualBinding.actorId }}：{{ row.manualBinding.reason }}</span></td>
            <td>付款 {{ time(row.paidAt) }}<br />验真 {{ time(row.verifiedAt) }}</td>
            <td>
              <Button v-if="['apple', 'google'].includes(row.channel) && can('system:billing:payment:recheck')" size="small" @click="operate('recheck', row)">重新验真</Button>
              <Button v-if="row.orderId === null && row.platformState === 'paid' && ['apple', 'google'].includes(row.channel) && can('system:billing:payment:bind')" size="small" @click="operate('bind', row)">人工关联订单</Button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="6">暂无符合条件的平台流水</td></tr>
        </tbody>
      </table>
    </div>
    <Button v-if="next" :loading="busy" @click="load(true)">加载更多</Button>
    <FormEditor v-model:open="editor" :title="operation === 'bind' ? '核实支付归属并关联订单' : '重新验真平台交易'" :fields="fields" :commit="commit" notice="核对平台付款、账号和业务凭证，必须记录核查依据。关联后仍须后台验真通过才履约，不能绕过矛盾绑定或已释放的名额。" @saved="saved" />
  </div>
</template>
