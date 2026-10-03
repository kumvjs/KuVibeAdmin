<script setup lang="ts">
import type { Body } from '#/api/billing';

import { computed, reactive, ref, watch } from 'vue';

import { Button, Modal, Select } from 'antdv-next';

import { errorText, integer, minor, money } from './helpers';

export interface Field {
  key: string;
  label: string;
  type?:
    | 'boolean'
    | 'daily-bonuses'
    | 'datetime'
    | 'integer'
    | 'limit'
    | 'list'
    | 'money'
    | 'multi'
    | 'multi-select'
    | 'number'
    | 'select'
    | 'text'
    | 'textarea';
  default?: boolean | string | string[];
  hint?: string;
  options?: { label: string; value: string }[];
  positive?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  requiredWhen?: (values: Record<string, boolean | string | string[]>) => boolean;
  visible?: (values: Record<string, boolean | string | string[]>) => boolean;
}
const props = defineProps<{
  commit: (body: Body) => Promise<unknown>;
  fields: Field[];
  initial?: Body;
  notice?: string;
  open: boolean;
  title: string;
}>();
const emit = defineEmits<{
  saved: [result: unknown];
  'update:open': [value: boolean];
}>();
const values = reactive<Record<string, boolean | string | string[]>>({});
const visibleFields = computed(() =>
  props.fields.filter((field) => !field.visible || field.visible(values)),
);
const bonusDayCount = computed(() =>
  Math.max(0, Math.min(366, Math.trunc(Number(values.maxConsecutiveDays) || 0))),
);
const busy = ref(false);
const failure = ref('');
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    failure.value = '';
    for (const field of props.fields) {
      const value = props.initial?.[field.key] ?? field.default;
      if (field.type === 'datetime' && typeof value === 'string' && value) {
        const date = new Date(value);
        values[field.key] = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16);
      } else if (field.type === 'money')
        values[field.key] = value === undefined ? '' : money(String(value));
      else if (field.type === 'list')
        values[field.key] = Array.isArray(value) ? value.join(',') : '';
      else if (['daily-bonuses', 'multi', 'multi-select'].includes(field.type || ''))
        values[field.key] = Array.isArray(value) ? [...value] : [];
      else if (field.type === 'boolean') values[field.key] = value === true;
      else
        values[field.key] =
          value === null || value === undefined ? '' : String(value);
    }
  },
  { immediate: true },
);
watch(bonusDayCount, (count) => {
  if (!props.fields.some((field) => field.type === 'daily-bonuses')) return;
  const previous = Array.isArray(values.dailyBonusPoints) ? values.dailyBonusPoints : [];
  values.dailyBonusPoints = Array.from({ length: count }, (_, index) => previous[index] ?? '0');
});
async function save() {
  if (busy.value) return;
  busy.value = true;
  failure.value = '';
  try {
    const body: Body = {};
    for (const field of visibleFields.value) {
      const value = values[field.key];
      const text = typeof value === 'string' ? value.trim() : '';
      if (
        (field.required || field.requiredWhen?.(values)) &&
        (value === '' || (Array.isArray(value) && value.length === 0))
      )
        throw new Error(`请${field.type === 'multi-select' ? '选择' : '填写'}${field.label}`);
      switch (field.type) {
        case 'daily-bonuses': {
          body[field.key] = Array.isArray(value) ? value.map((item) => integer(item)) : [];
          break;
        }
        case 'boolean': {
          body[field.key] = value === true;
          break;
        }
        case 'datetime': {
          body[field.key] = text ? new Date(text).toISOString() : null;
          break;
        }
        case 'integer': {
          body[field.key] = integer(text, field.positive);
          break;
        }
        case 'limit': {
          body[field.key] = text ? integer(text, field.positive) : null;
          break;
        }
        case 'list': {
          body[field.key] = text
            ? text.split(/[,，\s]+/).map((item) => integer(item, true))
            : [];
          break;
        }
        case 'money': {
          body[field.key] = integer(minor(text), field.positive);
          break;
        }
        case 'multi': {
          body[field.key] = value;
          break;
        }
        case 'multi-select': {
          body[field.key] = Array.isArray(value) ? [...value] : [];
          break;
        }
        case 'number': {
          const n = Number(text);
          const min = field.min ?? -100_000;
          const max = field.max ?? 100_000;
          if (!Number.isSafeInteger(n) || n < min || n > max)
            throw new Error(`${field.label}须为${min}到${max}内的整数`);
          body[field.key] = n;
          break;
        }
        default: {
          body[field.key] = text;
        }
      }
    }
    const result = await props.commit(body);
    emit('saved', result);
    emit('update:open', false);
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :width="760"
    :footer="null"
    :mask-closable="false"
    :closable="!busy"
    @cancel="!busy && emit('update:open', false)"
  >
    <p v-if="notice" class="billing-muted mb-4">{{ notice }}</p>
    <form class="billing-form" @submit.prevent="save">
      <component
        :is="['daily-bonuses', 'multi-select'].includes(field.type || '') ? 'div' : 'label'"
        v-for="field in visibleFields"
        :key="field.key"
        class="billing-field"
        :class="{ 'billing-full': field.type === 'textarea' || field.type === 'daily-bonuses' }"
      >
        <span :id="field.type === 'multi-select' ? `${field.key}-label` : undefined">{{ field.label }}{{ field.required || field.requiredWhen?.(values) ? ' *' : '' }}</span>
        <div v-if="field.type === 'daily-bonuses'" class="billing-form">
          <label v-for="day in bonusDayCount" :key="day" class="billing-field">
            <span>第 {{ day }} 天赠送积分</span>
            <input
              v-model="(values[field.key] as string[])[day - 1]"
              class="billing-input"
              type="text"
              inputmode="numeric"
              required
              :disabled="busy"
            />
          </label>
        </div>
        <Select
          v-else-if="field.type === 'multi-select'"
          v-model:value="values[field.key] as string[]"
          mode="multiple"
          :options="field.options"
          :aria-labelledby="`${field.key}-label`"
          :aria-required="field.required || field.requiredWhen?.(values)"
          :show-search="{ optionFilterProp: 'label' }"
          allow-clear
          placeholder="请选择套餐，可多选"
          :disabled="busy"
          :get-popup-container="(trigger: HTMLElement) => trigger.parentElement!"
        />
        <input
          v-else-if="field.type === 'boolean'"
          v-model="values[field.key] as boolean"
          type="checkbox"
          :disabled="busy"
        />
        <select
          v-else-if="field.type === 'select' || field.type === 'multi'"
          v-model="values[field.key] as string | string[]"
          class="billing-input"
          :multiple="field.type === 'multi'"
          :required="field.required"
          :disabled="busy"
        >
          <option
            v-for="option in field.options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <textarea
          v-else-if="field.type === 'textarea'"
          v-model="values[field.key] as string"
          class="billing-input"
          :required="field.required"
          :disabled="busy"
          rows="3"
          maxlength="500"
        ></textarea>
        <input
          v-else
          v-model="values[field.key] as string"
          class="billing-input"
          :type="field.type === 'datetime' ? 'datetime-local' : 'text'"
          :inputmode="
            ['integer', 'limit', 'number'].includes(field.type || '')
              ? 'numeric'
              : field.type === 'money'
                ? 'decimal'
                : 'text'
          "
          :required="field.required"
          :disabled="busy"
        />
        <span v-if="field.hint" class="billing-muted">{{ field.hint }}</span>
      </component>
      <p v-if="failure" role="alert" class="billing-error billing-full">
        {{ failure }}
      </p>
      <div class="billing-footer billing-full">
        <Button :disabled="busy" @click="emit('update:open', false)">
          取消
</Button><Button type="primary" html-type="submit" :loading="busy">
          确认提交
        </Button>
      </div>
    </form>
  </Modal>
</template>
