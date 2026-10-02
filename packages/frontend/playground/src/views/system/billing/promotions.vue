<script setup lang="ts">
import type { Body, Promotion } from '#/api/billing';
import type { Field } from '#/views/billing/form-editor.vue';

import { computed, onMounted, ref } from 'vue';

import { Button, message } from 'antdv-next';

import { getPromotions, issueCoupon, publishPromotion, savePromotion } from '#/api/billing';
import { promotionFields } from '#/views/billing/fields';
import FormEditor from '#/views/billing/form-editor.vue';
import { can, points, time, useTask } from '#/views/billing/helpers';

const rows = ref<Promotion[]>([]);
const page = ref(1);
const total = ref(0);
const selected = ref<Promotion>();
const editor = ref(false);
const coupon = ref(false);
const { busy, error, run } = useTask();
const effects: Record<string, string> = {
  bonus_bps: '比例赠分',
  bonus_fixed: '固定赠分',
  bonus_consecutive: '连续充值赠送',
  discount_bps: '折扣',
  fixed_discount: '直减',
};
const eligibility: Record<string, string> = {
  always: '所有充值',
  first_day: '每日首单',
  first_user: '用户首单',
};
const fields = computed<Field[]>(() =>
  selected.value
    ? promotionFields
    : [
        {
          key: 'code',
          label: '活动标识',
          required: true,
          hint: '小写字母开头，最长50字符',
        },
        ...promotionFields,
      ],
);
const couponFields: Field[] = [
  {
    key: 'promotionId',
    label: '活动ID',
    type: 'integer',
    positive: true,
    required: true,
  },
  {
    key: 'code',
    label: '券码',
    required: true,
    hint: '6到64位字母、数字、下划线或短横线；提交后自行安全分发',
  },
  {
    key: 'userId',
    label: '定向用户ID',
    type: 'limit',
    positive: true,
    hint: '留空为公共券码',
  },
  {
    key: 'totalLimit',
    label: '总使用次数',
    type: 'limit',
    hint: '留空不限，0禁用',
  },
  { key: 'startsAt', label: '生效时间', type: 'datetime', required: true },
  { key: 'endsAt', label: '到期时间', type: 'datetime', required: true },
];
async function load(number = page.value) {
  await run(async () => {
    const result = await getPromotions({ page: number, limit: 20 });
    rows.value = result.items;
    total.value = result.total;
    page.value = number;
  });
}
function edit(row?: Promotion) {
  selected.value = row;
  editor.value = true;
}
async function commit(body: Body) {
  if (body.effect === 'bonus_consecutive') {
    if (!Array.isArray(body.packageIds) || !body.packageIds.length)
      throw new Error('连续充值赠送须填写适用套餐ID，各套餐独立统计连续天数');
    if (
      !Array.isArray(body.dailyBonusPoints) ||
      body.dailyBonusPoints.length !== body.maxConsecutiveDays
    )
      throw new Error('请设置最大天数及对应每一天的赠送积分');
    body.eligibility = 'always';
    body.minimumMinor = '0';
    body.requiresCoupon = false;
    body.cashBudget = null;
  }
  if (body.eligibility !== 'always' && !String(body.effect).startsWith('bonus_'))
    throw new Error('首单活动仅支持赠分');
  return savePromotion(body, selected.value?.id);
}
async function publish(row: Promotion) {
  await run(async () => {
    await publishPromotion(row.id, row.status === 'enabled' ? 'disabled' : 'enabled');
  });
  if (!error.value) await load();
}
async function issue(body: Body) {
  const result = await issueCoupon(body);
  message.success(`券已发放，凭证 #${result.id}。请自行安全分发券码。`);
  return result;
}
onMounted(() => load());
</script>
<template>
  <div class="billing-page">
    <header class="billing-toolbar">
      <div>
        <h1>优惠活动与券</h1>
        <p class="billing-muted">配置首单、连续充值赠送、折扣、赠分及预算。</p>
      </div>
      <div class="billing-actions">
        <Button :loading="busy" @click="load()">刷新</Button><Button
          v-if="can('system:billing:promotion:write')"
          type="primary"
          @click="edit()"
        >
          新增活动
        </Button>
      </div>
    </header>
    <p v-if="error" class="billing-error" role="alert">{{ error }}</p>
    <section class="billing-panel billing-table">
      <table>
        <thead>
          <tr>
            <th>活动 / 版本</th>
            <th>规则</th>
            <th>有效期</th>
            <th>预算</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              {{ row.title }}<br /><span class="billing-muted">#{{ row.id }} · {{ row.code }} · v{{ row.revision }}</span>
            </td>
            <td>
              <template v-if="row.effect === 'bonus_consecutive'">
                连续充值赠送 · 最多 {{ row.maxConsecutiveDays }} 天<br />
                {{
                  row.dailyBonusPoints
                    ?.map((value, index) => `第${index + 1}天 ${points(value)}积分`)
                    .join('；')
                }}<br />
                <span class="billing-muted"
                  >{{ row.consecutiveGrantMode === 'every_order' ? '每单赠送' : '每天首笔赠送' }} ·
                  超出按最后一天赠送 · 实付不减免</span
                >
              </template>
              <template v-else>{{ effects[row.effect] }} {{ row.value }}</template
              ><br /><span class="billing-muted"
                >{{ eligibility[row.eligibility]
                }}{{ row.requiresCoupon ? ' · 需要券码' : '' }}</span>
            </td>
            <td>{{ time(row.startsAt) }}<br />{{ time(row.endsAt) }}</td>
            <td>
              减免
              {{
                row.cashBudget === null
                  ? '不限'
                  : `${points(row.cashBudget)}分`
              }}<br />赠分
              {{
                row.pointsBudget === null ? '不限' : points(row.pointsBudget)
              }}
            </td>
            <td>{{ row.status === 'enabled' ? '已启用' : '未启用' }}</td>
            <td>
              <div class="billing-actions">
                <Button
                  v-if="can('system:billing:promotion:write')"
                  size="small"
                  @click="edit(row)"
                >
                  新版本
</Button><Button
                  v-if="can('system:billing:promotion:publish')"
                  size="small"
                  :disabled="busy"
                  @click="publish(row)"
                >
                  {{ row.status === 'enabled' ? '停用' : '启用' }}
</Button><Button
                  v-if="
                    can('system:billing:promotion:write') && row.requiresCoupon
                  "
                  size="small"
                  @click="
                    selected = row;
                    coupon = true;
                  "
                >
                  发放券码
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="billing-empty">暂无优惠活动</p>
      <div class="billing-footer">
        <span class="billing-muted">共 {{ total }} 个活动 · 第 {{ page }} 页</span><Button :disabled="busy || page <= 1" @click="load(page - 1)">
          上一页
</Button><Button :disabled="busy || page * 20 >= total" @click="load(page + 1)">
          下一页
        </Button>
      </div>
    </section>
    <FormEditor
      v-model:open="editor"
      :title="selected ? '创建活动新版本' : '新增活动'"
      :fields="fields"
      :initial="selected as unknown as Body"
      :commit="commit"
      notice="首单和连续天数按成功入账判断，退款不恢复；连续活动实付按套餐定价，只赠送积分，同类赠分择优。内购价格由商店决定。"
      @saved="load()"
    />
    <FormEditor
      v-model:open="coupon"
      title="发放券码"
      :fields="couponFields"
      :initial="{ promotionId: selected?.id }"
      :commit="issue"
      notice="券固定绑定当前活动版本。系统仅保存摘要，不提供券码找回；请在提交前妥善保存并安全分发。"
    />
  </div>
</template>
