<script setup lang="ts">
import type { Order } from '#/api/billing';

import { channels, money, points, statuses, time } from './helpers';

defineProps<{ order: Order }>();
</script>
<template>
  <dl class="billing-detail">
    <div>
      <dt>商户订单号</dt>
      <dd class="billing-code">{{ order.merchantNo }}</dd>
    </div>
    <div>
      <dt>状态</dt>
      <dd>{{ statuses[order.status] }}</dd>
    </div>
    <div>
      <dt>套餐 / 版本</dt>
      <dd>{{ order.title }} · #{{ order.versionId }}</dd>
    </div>
    <div>
      <dt>渠道 / 确认金额</dt>
      <dd>
        {{ channels[order.channel] }} ·
        {{
          order.payableMinor === null
            ? '以商店扣款记录为准'
            : `¥${money(order.payableMinor)}`
        }}
      </dd>
    </div>
    <div>
      <dt>创建时间</dt>
      <dd>{{ time(order.createdAt) }}</dd>
    </div>
    <div>
      <dt>到期时间</dt>
      <dd>{{ time(order.expiresAt) }}</dd>
    </div>
    <div>
      <dt>入账时间</dt>
      <dd>{{ time(order.settledAt) }}</dd>
    </div>
    <div>
      <dt>关闭时间</dt>
      <dd>{{ time(order.closedAt) }}</dd>
    </div>
    <div>
      <dt>订单确认基础 / 套餐赠分</dt>
      <dd>{{ points(order.basePoints) }} / {{ points(order.giftPoints) }}</dd>
    </div>
    <div>
      <dt>订单保底活动赠分</dt>
      <dd>{{ points(order.guaranteedBonusPoints) }}</dd>
    </div>
  </dl>
  <div v-if="order.settlement" class="billing-panel">
    <h2>原实际入账</h2>
    <p>
      基础 {{ points(order.settlement.basePoints) }} + 赠分
      {{ points(order.settlement.giftPoints) }}
    </p>
    <p class="billing-muted">
      赠分已包含活动赠分
      {{
        points(order.settlement.bonusPoints)
      }}。退款后仍保留此历史记录，不代表当前可用余额。
    </p>
    <p class="billing-code">
      基础流水 #{{ order.settlement.paidLedgerId
      }}<span v-if="order.settlement.giftLedgerId">
        · 赠分流水 #{{ order.settlement.giftLedgerId }}</span>
    </p>
  </div>
  <p v-else class="billing-muted">
    尚无积分入账记录。首单等条件赠分按服务端成功入账判定。
  </p>
</template>
