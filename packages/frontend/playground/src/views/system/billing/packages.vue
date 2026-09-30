<script setup lang="ts">
import type { Body, ChannelProduct, RechargePackage } from '#/api/billing';
import type { Field } from '#/views/billing/form-editor.vue';

import { computed, onMounted, ref } from 'vue';

import { Button, Modal } from 'antdv-next';

import {
  getPackages,
  getProducts,
  publishPackage,
  savePackage,
  saveProduct,
} from '#/api/billing';
import { packageFields, productFields } from '#/views/billing/fields';
import FormEditor from '#/views/billing/form-editor.vue';
import { can, channels, money, points, useTask } from '#/views/billing/helpers';

const rows = ref<RechargePackage[]>([]);
const page = ref(1);
const total = ref(0);
const selected = ref<RechargePackage>();
const editor = ref(false);
const productEditor = ref(false);
const productOpen = ref(false);
const products = ref<ChannelProduct[]>([]);
const { busy, error, run } = useTask();
const fields = computed<Field[]>(() =>
  selected.value
    ? packageFields
    : [
        {
          key: 'code',
          label: '套餐标识',
          required: true,
          hint: '小写字母开头，字母数字、下划线或短横线，最长50',
        },
        ...packageFields,
      ],
);
async function load(number = page.value) {
  await run(async () => {
    const result = await getPackages({ page: number, limit: 20 }, true);
    rows.value = result.items;
    total.value = result.total;
    page.value = number;
  });
}
function edit(row?: RechargePackage) {
  selected.value = row;
  editor.value = true;
}
async function commit(body: Body) {
  return savePackage(body, selected.value?.id);
}
async function publish(row: RechargePackage) {
  await run(async () => {
    await publishPackage(
      row.id,
      row.status === 'enabled' ? 'disabled' : 'enabled',
    );
  });
  if (!error.value) await load();
}
async function showProducts(row: RechargePackage) {
  await run(async () => {
    selected.value = row;
    products.value = await getProducts(row.versionId);
    productOpen.value = true;
  });
}
onMounted(() => load());
</script>
<template>
  <div class="billing-page">
    <header class="billing-toolbar">
      <div>
        <h1>充值套餐</h1>
        <p class="billing-muted">
          管理固定权益、销售窗口、限量与商店商品映射。
        </p>
      </div>
      <div class="billing-actions">
        <Button :loading="busy" @click="load()">刷新</Button><Button
          v-if="can('system:billing:catalog:write')"
          type="primary"
          @click="edit()"
        >
          新增套餐
        </Button>
      </div>
    </header>
    <p v-if="error" role="alert" class="billing-error">{{ error }}</p>
    <section class="billing-panel billing-table">
      <table>
        <thead>
          <tr>
            <th>套餐 / 版本</th>
            <th>售价</th>
            <th>基础 / 赠分</th>
            <th>每日 / 总限量</th>
            <th>用户日 / 累计限购</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              {{ row.title }}<br /><span class="billing-muted">#{{ row.id }} · {{ row.code }} · v{{ row.revision }}</span>
            </td>
            <td>¥{{ money(row.priceMinor) }}</td>
            <td>{{ points(row.basePoints) }} / {{ points(row.giftPoints) }}</td>
            <td>
              {{ row.dailyLimit === null ? '不限' : points(row.dailyLimit) }} /
              {{ row.totalLimit === null ? '不限' : points(row.totalLimit) }}
            </td>
            <td>
              {{
                row.userDailyLimit === null
                  ? '不限'
                  : points(row.userDailyLimit)
              }}
              /
              {{
                row.userTotalLimit === null
                  ? '不限'
                  : points(row.userTotalLimit)
              }}
            </td>
            <td>
              {{
                row.status === 'enabled'
                  ? '已上架'
                  : row.status === 'draft'
                    ? '草稿'
                    : '已下架'
              }}
            </td>
            <td>
              <div class="billing-actions">
                <Button
                  v-if="can('system:billing:catalog:write')"
                  size="small"
                  @click="edit(row)"
                >
                  新版本
</Button><Button
                  v-if="can('system:billing:catalog:publish')"
                  size="small"
                  :disabled="busy"
                  @click="publish(row)"
                >
                  {{ row.status === 'enabled' ? '下架' : '上架' }}
</Button><Button
                  size="small"
                  :disabled="busy"
                  @click="showProducts(row)"
                >
                  内购商品
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="billing-empty">暂无套餐</p>
      <div class="billing-footer">
        <span class="billing-muted">共 {{ total }} 个套餐 · 第 {{ page }} 页</span><Button :disabled="busy || page <= 1" @click="load(page - 1)">
          上一页
</Button><Button :disabled="busy || page * 20 >= total" @click="load(page + 1)">
          下一页
        </Button>
      </div>
    </section>
    <FormEditor
      v-model:open="editor"
      :title="selected ? '创建套餐新版本' : '新增套餐'"
      :fields="fields"
      :initial="selected as unknown as Body"
      :commit="commit"
      notice="变更创建新版本，旧订单权益和已售额度保持。限量留空不限，0不可买；销售时间按设备当地时间输入。"
      @saved="load()"
    />
    <Modal
      v-model:open="productOpen"
      title="当前版本内购商品"
      :width="760"
      :footer="null"
    >
      <p class="billing-muted">
        固定SKU绑定套餐版本，不能覆盖旧SKU权益。价格由商店展示；严格站内库存和现金券不用于内购。
      </p>
      <div class="billing-table">
        <table>
          <thead>
            <tr>
              <th>商店</th>
              <th>应用</th>
              <th>环境</th>
              <th>商品ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in products" :key="product.id">
              <td>{{ channels[product.channel] }}</td>
              <td>{{ product.applicationId }}</td>
              <td>{{ product.environment }}</td>
              <td>{{ product.productId }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!products.length" class="billing-empty">暂无映射</p>
      </div>
      <Button
        v-if="can('system:billing:catalog:write')"
        type="primary"
        @click="productEditor = true"
      >
        添加商品映射
      </Button>
    </Modal>
    <FormEditor
      v-model:open="productEditor"
      title="添加固定SKU映射"
      :fields="productFields"
      :initial="{ versionId: selected?.versionId }"
      :commit="saveProduct"
      @saved="selected && showProducts(selected)"
    />
  </div>
</template>
