<script setup lang="ts">
import type { PointLedger } from '#/api/billing';

import { actions, points, time } from './helpers';

defineProps<{ rows: PointLedger[] }>();
</script>
<template>
  <div class="billing-table">
    <table>
      <thead>
        <tr>
          <th>流水 / 时间</th>
          <th>操作</th>
          <th>数量</th>
          <th>可用变动</th>
          <th>冻结变动</th>
          <th>操作后可用 / 冻结</th>
          <th>业务与凭证</th>
          <th>原因 / 操作人</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>
            <span class="billing-code">#{{ row.id }}</span><br /><span class="billing-muted">{{ time(row.createdAt) }}</span>
          </td>
          <td>{{ actions[row.action] || row.action }}</td>
          <td>{{ points(row.amount) }}</td>
          <td>{{ points(row.availableDelta) }}</td>
          <td>{{ points(row.frozenDelta) }}</td>
          <td>
            {{ points(row.availableAfter) }} / {{ points(row.frozenAfter) }}
          </td>
          <td class="wrap">
            <div>{{ row.businessType }}</div>
            <div class="billing-code">{{ row.businessKey }}</div>
            <div v-if="row.holdId">冻结凭证 #{{ row.holdId }}</div>
            <div v-if="row.referenceId">关联流水 #{{ row.referenceId }}</div>
          </td>
          <td class="wrap">
            {{ row.reason }}<br /><span class="billing-muted">{{
              row.actorId ? `操作人 #${row.actorId}` : '系统处理'
            }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="billing-empty">暂无积分流水</p>
  </div>
</template>
