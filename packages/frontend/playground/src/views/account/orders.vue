<script setup lang="ts">
import type { Order } from '#/api/billing';

import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Modal } from 'antdv-next';

import { getOrder, getOrders } from '#/api/billing';
import {
  channels,
  money,
  statuses,
  time,
  useTask,
} from '#/views/billing/helpers';
import OrderDetail from '#/views/billing/order-detail.vue';
import PaymentPanel from '#/views/billing/payment-panel.vue';

const rows = ref<Order[]>([]);
const next = ref<null | string>(null);
const selected = ref<Order>();
const paymentId = ref('');
const { busy, error, run } = useTask();
const router = useRouter();
async function load(more = false) {
  await run(async () => {
    const page = await getOrders({
      cursor: more ? next.value || undefined : undefined,
      limit: 20,
    });
    rows.value = more ? [...rows.value, ...page.items] : page.items;
    next.value = page.nextCursor;
  });
}
async function detail(id: string) {
  await run(async () => {
    selected.value = await getOrder(id);
  });
}
function changed(order: Order) {
  rows.value = rows.value.map((row) => (row.id === order.id ? order : row));
  if (order.status === 'paid')
    window.dispatchEvent(new Event('billing:balance-updated'));
}
onMounted(() => load());
</script>
<template>
  <div class="billing-page">
    <header class="billing-toolbar">
      <div>
        <h1>历史订单</h1>
        <p class="billing-muted">
          查看付款、积分入账与退款状态，继续处理原订单。
        </p>
      </div>
      <div class="billing-actions">
        <Button :loading="busy" @click="load()">刷新</Button><Button type="primary" @click="router.push('/account/recharge')">
          充值积分
        </Button>
      </div>
    </header>
    <p v-if="error" role="alert" class="billing-error">{{ error }}</p>
    <section class="billing-panel billing-table">
      <table>
        <thead>
          <tr>
            <th>订单 / 套餐</th>
            <th>渠道</th>
            <th>确认金额</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="wrap">
              <div>{{ row.title }}</div>
              <span class="billing-code">#{{ row.id }} · {{ row.merchantNo }}</span>
            </td>
            <td>{{ channels[row.channel] }}</td>
            <td>
              {{
                row.payableMinor === null
                  ? '商店定价'
                  : `¥${money(row.payableMinor)}`
              }}
            </td>
            <td>
              <span class="billing-tag">{{ statuses[row.status] }}</span>
            </td>
            <td>{{ time(row.createdAt) }}</td>
            <td>
              <div class="billing-actions">
                <Button size="small" :disabled="busy" @click="detail(row.id)">
                  详情
</Button><Button
                  v-if="['pending', 'closing', 'review'].includes(row.status)"
                  size="small"
                  @click="paymentId = row.id"
                >
                  {{ row.status === 'pending' ? '继续处理' : '查询状态' }}
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length && !busy" class="billing-empty">暂无历史订单</p>
      <div class="billing-footer">
        <Button v-if="next" :loading="busy" @click="load(true)">加载更多</Button><span v-else-if="rows.length" class="billing-muted">已显示全部订单</span>
      </div>
    </section>
    <Modal
      :open="!!selected"
      title="订单详情"
      :width="850"
      :footer="null"
      @cancel="selected = undefined"
    >
      <OrderDetail v-if="selected" :order="selected" />
    </Modal>
    <Modal
      :open="!!paymentId"
      title="查询与处理订单"
      :footer="null"
      :destroy-on-close="true"
      @cancel="paymentId = ''"
    >
      <PaymentPanel
        v-if="paymentId"
        :key="paymentId"
        :order-id="paymentId"
        @changed="changed"
      />
    </Modal>
  </div>
</template>
