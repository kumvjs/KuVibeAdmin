<script setup lang="ts">
import type { Order, Quote, RechargePackage } from '#/api/billing';

import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Modal } from 'antdv-next';

import { createOrder, getPackages, getQuote } from '#/api/billing';
import {
  attemptKey,
  clearAttempt,
  money,
  points,
  useTask,
} from '#/views/billing/helpers';
import PaymentPanel from '#/views/billing/payment-panel.vue';

const packages = ref<RechargePackage[]>([]);
const page = ref(1);
const total = ref(0);
const channel = ref<'alipay' | 'wechat'>('wechat');
const couponCode = ref('');
const selected = ref<RechargePackage>();
const quote = ref<Quote>();
const quoteOpen = ref(false);
const paymentId = ref('');
const router = useRouter();
const { busy, error, run } = useTask();
watch([channel, couponCode], () => {
  quote.value = undefined;
  quoteOpen.value = false;
});
async function load(more = false) {
  await run(async () => {
    const result = await getPackages({
      page: more ? page.value + 1 : 1,
      limit: 12,
    });
    packages.value = more ? [...packages.value, ...result.items] : result.items;
    total.value = result.total;
    page.value = more ? page.value + 1 : 1;
  });
}
async function preview(pack: RechargePackage) {
  await run(async () => {
    const result = await getQuote(pack.id, {
      channel: channel.value,
      couponCode: couponCode.value.trim() || undefined,
    });
    selected.value = pack;
    quote.value = result;
    quoteOpen.value = true;
  });
}
async function checkout() {
  await run(async () => {
    if (!quote.value || !selected.value || !quote.value.payableMinor)
      throw new Error('请先确认当前报价');
    const body = {
      channel: channel.value,
      client: 'qr',
      packageId: selected.value.id,
      versionId: quote.value.versionId,
      payableMinor: quote.value.payableMinor,
      ...(couponCode.value.trim()
        ? { couponCode: couponCode.value.trim() }
        : {}),
    };
    const order = await createOrder({
      ...body,
      idempotencyKey: attemptKey('checkout', body),
    });
    // 已确认下单；付款重试查询原订单。待付订单互斥仍由后端保证。
    clearAttempt('checkout');
    paymentId.value = order.id;
    quoteOpen.value = false;
  });
}
function changed(order: Order) {
  if (['closed', 'paid', 'refunded'].includes(order.status))
    clearAttempt('checkout');
  if (order.status === 'paid')
    window.dispatchEvent(new Event('billing:balance-updated'));
}
onMounted(() => load());
</script>
<template>
  <div class="billing-page">
    <header class="billing-toolbar">
      <div>
        <h1>充值中心</h1>
        <p class="billing-muted">选择套餐，确认优惠后扫码付款。</p>
      </div>
      <Button @click="router.push('/account/orders')">
        历史订单 / 继续付款
      </Button>
    </header>
    <section class="billing-panel billing-actions">
      <label>支付方式
        <select
          v-model="channel"
          class="billing-input billing-filter"
          :disabled="busy"
        >
          <option value="wechat">微信支付</option>
          <option value="alipay">支付宝</option>
        </select></label><label>优惠券码
        <input
          v-model="couponCode"
          class="billing-input billing-filter"
          placeholder="选填"
          maxlength="64"
          :disabled="busy"
/></label><Button :loading="busy" @click="load()">刷新套餐</Button>
    </section>
    <p v-if="error" role="alert" class="billing-error">
      {{ error }} · 网络失败请重试同一操作；已有待付订单请先查询历史订单。
    </p>
    <div class="billing-grid">
      <section
        v-for="pack in packages"
        :key="pack.id"
        class="billing-panel flex flex-col gap-3"
      >
        <span class="billing-tag self-start">{{
          pack.dailyLimit === null
            ? '常规套餐'
            : `每日限量 ${points(pack.dailyLimit)} 份`
        }}</span>
        <h2>{{ pack.title }}</h2>
        <div class="billing-money">¥{{ money(pack.priceMinor) }}</div>
        <div class="billing-value">
          {{ points(pack.basePoints) }}
          <span class="billing-muted">基础积分</span>
        </div>
        <p>赠送 {{ points(pack.giftPoints) }} 积分</p>
        <p class="billing-muted">
          每人累计
          {{
            pack.userTotalLimit === null
              ? '不限'
              : `${points(pack.userTotalLimit)}份`
          }}
          · 每日
          {{
            pack.userDailyLimit === null
              ? '不限'
              : `${points(pack.userDailyLimit)}份`
          }}
        </p>
        <Button
          type="primary"
          class="mt-auto"
          :loading="busy"
          @click="preview(pack)"
        >
          查看优惠并充值
        </Button>
      </section>
    </div>
    <div v-if="!packages.length && !busy" class="billing-panel billing-empty">
      暂无可购买套餐，请稍后再来。
    </div>
    <div v-if="packages.length < total" class="billing-footer">
      <Button :loading="busy" @click="load(true)">更多套餐</Button>
    </div>
    <p class="billing-muted">
      每日限量按北京时间计算，余量以提交订单时为准。Apple/Google 内购请在对应
      App 内购买。
    </p>
    <Modal
      v-model:open="quoteOpen"
      title="确认充值"
      :footer="null"
      :mask-closable="false"
      :closable="!busy"
    >
      <template v-if="quote">
        <h2>{{ selected?.title }}</h2>
        <p class="billing-money">¥{{ money(quote.payableMinor) }}</p>
        <p>
          基础 {{ points(quote.basePoints) }} + 套餐赠分
          {{ points(quote.packageGiftPoints) }}
        </p>
        <p>
          预计活动赠分 {{ points(quote.estimatedBonusPoints) }}，其中保底
          {{ points(quote.guaranteedBonusPoints) }}
        </p>
        <p class="billing-muted">{{ quote.notice }}</p>
        <p class="billing-muted">
          预计赠分已包含保底赠分，不重复相加；首单资格按成功入账判断。
        </p>
        <p v-if="error" class="billing-error">{{ error }}</p>
        <div class="billing-footer">
          <Button :disabled="busy" @click="quoteOpen = false">返回</Button><Button type="primary" :loading="busy" @click="checkout">
            确认并创建订单
          </Button>
        </div>
      </template>
    </Modal>
    <Modal
      :open="!!paymentId"
      title="订单付款"
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
