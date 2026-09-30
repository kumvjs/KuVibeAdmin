<script setup lang="ts">
import type { Order } from '#/api/billing';

import { computed, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';

import { Button, QRCode } from 'antdv-next';

import { cancelOrder, getOrder, preparePayment } from '#/api/billing';

import { channels, errorText, money, statuses } from './helpers';

const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ changed: [order: Order] }>();
const order = ref<Order>();
const codeUrl = ref('');
const busy = ref(false);
const failure = ref('');
const waiting = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let deadline = 0;
const cash = computed(
  () => order.value && ['alipay', 'wechat'].includes(order.value.channel),
);
function stop() {
  generation++;
  clearTimeout(timer);
  waiting.value = false;
  busy.value = false;
}
function pause() {
  clearTimeout(timer);
  waiting.value = false;
}
async function update(current: number) {
  busy.value = true;
  try {
    const latest = await getOrder(props.orderId);
    if (current !== generation) return;
    order.value = latest;
    emit('changed', latest);
    if (
      latest.status !== 'pending' ||
      !['alipay', 'wechat'].includes(latest.channel)
    ) {
      codeUrl.value = '';
      pause();
      return;
    }
    const payment = await preparePayment(latest.id);
    if (current !== generation) return;
    codeUrl.value =
      payment.status === 'ready' ? payment.parameters?.codeUrl || '' : '';
    if (Date.now() < deadline) {
      waiting.value = true;
      timer = setTimeout(() => void update(current), 3000);
    } else {
      waiting.value = false;
      failure.value = '自动查询已暂停，可点击刷新继续查询原订单。';
    }
  } catch (error) {
    if (current === generation) {
      failure.value = errorText(error);
      pause();
    }
  } finally {
    if (current === generation) busy.value = false;
  }
}
function start() {
  if (busy.value) return;
  stop();
  failure.value = '';
  deadline = Date.now() + 60_000;
  void update(generation);
}
async function cancel() {
  if (busy.value) return;
  stop();
  failure.value = '';
  busy.value = true;
  try {
    order.value = await cancelOrder(props.orderId);
    codeUrl.value = '';
    emit('changed', order.value);
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
onMounted(start);
onBeforeUnmount(stop);
onDeactivated(stop);
</script>
<template>
  <div class="billing-panel">
    <h2>{{ order ? statuses[order.status] : '正在查询订单' }}</h2>
    <p v-if="order">
      {{ order.title }} · {{ channels[order.channel] }} ·
      {{
        order.payableMinor === null
          ? '商店定价'
          : `¥${money(order.payableMinor)}`
      }}
    </p>
    <div
      v-if="codeUrl && order?.status === 'pending'"
      class="my-5 flex flex-col items-center gap-3"
    >
      <QRCode :value="codeUrl" :size="240" />
      <p>
        请用{{
          order.channel === 'wechat' ? '微信' : '支付宝'
        }}扫描二维码完成付款
      </p>
    </div>
    <p v-if="order?.status === 'paid'">支付成功，积分已由服务端确认入账。</p>
    <p v-else-if="order?.status === 'closing'" class="billing-muted">
      正在确认渠道关闭结果，确认前保留订单。请稍后刷新。
    </p>
    <p v-else-if="order?.status === 'review'" class="billing-muted">
      订单需要人工核查，请联系管理员。
    </p>
    <p v-else-if="order && !cash" class="billing-muted">
      此订单由原生App与应用商店处理，请在原App恢复交易，网页不能代替商店付款。
    </p>
    <p v-else-if="waiting && !codeUrl" class="billing-muted">
      正在准备二维码，请稍候…
    </p>
    <p v-if="failure" role="alert" class="billing-error">
      {{ failure }}<br />可继续查询或在历史订单中恢复原订单，请勿重复新建订单。
    </p>
    <div class="billing-actions mt-4">
      <Button :loading="busy" @click="start">刷新订单</Button><Button
        v-if="cash && order?.status === 'pending'"
        :disabled="busy"
        @click="cancel"
      >
        取消订单
      </Button>
    </div>
    <p class="billing-muted">
      请以订单“支付成功”为准。扫码、关闭页面或客户端提示均不代表积分已到账。
    </p>
  </div>
</template>
