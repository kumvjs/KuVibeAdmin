<script setup lang="ts">
import type { Body, Order, Reconciliation, Refund, Risk } from '#/api/billing';
import type { Field } from '#/views/billing/form-editor.vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { Button, message, Modal } from 'antdv-next';

import {
  getOrder,
  getOrders,
  getReconciliations,
  getRefunds,
  getRisks,
  reconcileOrder,
  refundOrder,
  resolveRisk,
} from '#/api/billing';
import { reasonField } from '#/views/billing/fields';
import FormEditor from '#/views/billing/form-editor.vue';
import {
  attemptKey,
  can,
  channels,
  clearAttempt,
  money,
  points,
  statuses,
  time,
  useTask,
} from '#/views/billing/helpers';
import OrderDetail from '#/views/billing/order-detail.vue';

const rows = ref<Order[]>([]);
const next = ref<null | string>(null);
const filters = reactive({
  channel: '',
  merchantNo: '',
  status: '',
  userId: '',
});
let applied = { ...filters };
const selected = ref<Order>();
const refunds = ref<Refund[]>([]);
const audits = ref<Reconciliation[]>([]);
const risks = ref<Risk[]>([]);
const operation = ref<'reconcile' | 'refund' | 'resolve'>('reconcile');
const riskId = ref('');
const editor = ref(false);
const { busy, error, run } = useTask();
const fields = computed<Field[]>(() =>
  operation.value === 'reconcile'
    ? [
        {
          key: 'verifyChannel',
          label: '主动核对渠道事实',
          type: 'boolean',
          default: true,
          hint: '取消后仅核对站内账务，报告明确标记渠道未检查',
        },
        {
          key: 'repairProjection',
          label: '依据完整证据重建账户投影',
          type: 'boolean',
          default: false,
          hint: '只修复账户缓存余额/序号；来源证据矛盾拒绝修复，不自动解除风险',
        },
        reasonField,
      ]
    : [reasonField],
);
async function load(more = false) {
  await run(async () => {
    const desired = more ? applied : { ...filters };
    const result = await getOrders(
      {
        userId: desired.userId.trim() || undefined,
        status: desired.status || undefined,
        channel: desired.channel || undefined,
        merchantNo: desired.merchantNo.trim() || undefined,
        cursor: more ? next.value || undefined : undefined,
        limit: 20,
      },
      true,
    );
    if (!more) applied = desired;
    rows.value = more ? [...rows.value, ...result.items] : result.items;
    next.value = result.nextCursor;
  });
}
async function detail(id: string) {
  await run(async () => {
    const order = await getOrder(id, true);
    const [refundRows, reports, riskRows] = await Promise.all([
      getRefunds(id),
      getReconciliations(id),
      getRisks(order.userId),
    ]);
    selected.value = order;
    refunds.value = refundRows;
    audits.value = reports;
    risks.value = riskRows;
  });
}
async function commit(body: Body) {
  if (!selected.value) throw new Error('请先查询订单');
  const id = selected.value.id;
  const scope = `${operation.value}:${operation.value === 'resolve' ? riskId.value : id}`;
  const command = { ...body, idempotencyKey: attemptKey(scope, body) };
  let result: unknown;
  if (operation.value === 'refund') result = await refundOrder(id, command);
  else if (operation.value === 'reconcile')
    result = await reconcileOrder(id, command);
  else result = await resolveRisk(riskId.value, String(body.reason));
  clearAttempt(scope);
  message.success(
    operation.value === 'resolve'
      ? '风险处置已记录'
      : '申请已记录，请刷新查询处理结果',
  );
  return result;
}
function operate(kind: 'reconcile' | 'refund' | 'resolve', risk?: Risk) {
  operation.value = kind;
  riskId.value = risk?.id || '';
  editor.value = true;
}
async function saved() {
  if (selected.value) await detail(selected.value.id);
  await load();
}
onMounted(() => load());
</script>
<template>
  <div class="billing-page">
    <header>
      <h1>订单与账务</h1>
      <p class="billing-muted">查询充值订单，处理全额退款、对账及用户风险。</p>
    </header>
    <form class="billing-panel billing-actions" @submit.prevent="load()">
      <input
        v-model="filters.userId"
        class="billing-input billing-filter"
        placeholder="用户ID"
        aria-label="用户ID"
      /><input
        v-model="filters.merchantNo"
        class="billing-input billing-filter"
        placeholder="商户订单号（精确）"
        aria-label="商户订单号"
      /><select
        v-model="filters.channel"
        class="billing-input billing-filter"
        aria-label="渠道"
      >
        <option value="">全部渠道</option>
        <option v-for="(label, key) in channels" :key="key" :value="key">
          {{ label }}
        </option>
</select><select
        v-model="filters.status"
        class="billing-input billing-filter"
        aria-label="订单状态"
      >
        <option value="">全部状态</option>
        <option v-for="(label, key) in statuses" :key="key" :value="key">
          {{ label }}
        </option>
</select><Button type="primary" html-type="submit" :loading="busy">
        查询订单
      </Button>
    </form>
    <p v-if="error" role="alert" class="billing-error">{{ error }}</p>
    <section class="billing-panel billing-table">
      <table>
        <thead>
          <tr>
            <th>订单 / 用户</th>
            <th>套餐</th>
            <th>渠道 / 金额</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="wrap">
              <span class="billing-code">#{{ row.id }} · 用户 #{{ row.userId }}</span><br /><span class="billing-code">{{ row.merchantNo }}</span>
            </td>
            <td>{{ row.title }}</td>
            <td>
              {{ channels[row.channel] }}<br />{{
                row.payableMinor === null
                  ? '商店定价'
                  : `¥${money(row.payableMinor)}`
              }}
            </td>
            <td>{{ statuses[row.status] }}</td>
            <td>{{ time(row.createdAt) }}</td>
            <td>
              <Button size="small" :disabled="busy" @click="detail(row.id)">
                查看账务
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length && !busy" class="billing-empty">
        暂无符合条件的订单
      </p>
      <div class="billing-footer">
        <Button v-if="next" :loading="busy" @click="load(true)">加载更多</Button><span v-else-if="rows.length" class="billing-muted">已显示全部匹配订单</span>
      </div>
    </section>
    <Modal
      :open="!!selected"
      title="订单详情与账务"
      :width="1100"
      :footer="null"
      @cancel="selected = undefined"
    >
      <template v-if="selected">
        <OrderDetail :order="selected" />
        <div class="billing-actions my-5">
          <Button :loading="busy" @click="detail(selected.id)">刷新账务</Button><Button
            v-if="
              can('system:billing:order:refund') &&
              ['wechat', 'alipay'].includes(selected.channel) &&
              ['paid', 'review'].includes(selected.status)
            "
            danger
            @click="operate('refund')"
          >
            申请全额退款
</Button><Button
            v-if="can('system:billing:order:reconcile')"
            @click="operate('reconcile')"
          >
            发起对账
          </Button>
        </div>
        <p class="billing-muted">
          主动退款须原充值权益全部未使用、未冻结；未知渠道结果保持冻结，系统不会挪用其他充值积分。
        </p>
        <h2 class="mt-5">退款记录</h2>
        <div class="billing-table">
          <table>
            <thead>
              <tr>
                <th>退款号 / 状态</th>
                <th>金额</th>
                <th>来源 / 回收 / 缺口</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in refunds" :key="row.id">
                <td>{{ row.refundNo }}<br />{{ row.status }}</td>
                <td>
                  {{
                    row.amountMinor === null
                      ? '以渠道记录为准'
                      : `¥${money(row.amountMinor)}`
                  }}
                </td>
                <td>
                  {{ points(row.sourcePoints) }} /
                  {{ points(row.recoveredPoints) }} /
                  {{ points(row.gapPoints) }}
                </td>
                <td class="wrap">{{ row.reason }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!refunds.length" class="billing-empty">暂无退款记录</p>
        </div>
        <h2 class="mt-5">对账报告</h2>
        <div v-for="audit in audits" :key="audit.id" class="billing-panel my-3">
          <p>
            #{{ audit.id }} · {{ audit.status }} · {{ time(audit.createdAt) }} ·
            {{ audit.verifyChannel ? '含渠道核对' : '仅站内核对' }}
          </p>
          <p>{{ audit.reason }}</p>
          <ul v-if="audit.findings?.length" class="billing-code">
            <li v-for="(finding, index) in audit.findings" :key="index">
              {{ finding.code }} · 预期 {{ finding.expected || '—' }} / 实际
              {{ finding.actual || '—' }}
            </li>
          </ul>
        </div>
        <p v-if="!audits.length" class="billing-muted">暂无对账报告</p>
        <h2 class="mt-5">用户风险审计</h2>
        <div class="billing-table">
          <table>
            <thead>
              <tr>
                <th>风险 / 订单</th>
                <th>类型</th>
                <th>缺口积分</th>
                <th>状态 / 处置</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="risk in risks" :key="risk.id">
                <td>#{{ risk.id }} · 订单 #{{ risk.orderId }}</td>
                <td>{{ risk.type }}</td>
                <td>{{ points(risk.gapPoints) }}</td>
                <td class="wrap">
                  {{ risk.status }} · {{ risk.resolutionReason || '待处理' }}
                </td>
                <td>
                  <Button
                    v-if="
                      risk.status === 'open' &&
                      can('system:billing:risk:resolve')
                    "
                    size="small"
                    @click="operate('resolve', risk)"
                  >
                    记录人工处置
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="billing-muted">
          风险处置不生成虚假退款或积分，仅全部风险解决后解除账户消费限制。
        </p>
      </template>
    </Modal>
    <FormEditor
      v-model:open="editor"
      :title="
        operation === 'refund'
          ? '申请全额退款'
          : operation === 'resolve'
            ? '记录风险处置依据'
            : '申请对账与恢复'
      "
      :fields="fields"
      :commit="commit"
      notice="确认前核对业务凭证。请求失败后保持原内容重试；申请成功后请查询服务端最终结果。"
      @saved="saved"
    />
  </div>
</template>
