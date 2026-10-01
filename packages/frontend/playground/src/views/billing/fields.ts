import type { Field } from './form-editor.vue';

export const packageFields: Field[] = [
  { key: 'title', label: '套餐名称', required: true },
  {
    key: 'priceMinor',
    label: '现金售价（元）',
    type: 'money',
    positive: true,
    required: true,
  },
  {
    key: 'basePoints',
    label: '基础积分',
    type: 'integer',
    positive: true,
    required: true,
  },
  {
    key: 'giftPoints',
    label: '套餐赠分',
    type: 'integer',
    default: '0',
    required: true,
  },
  ...(
    [
      ['totalLimit', '总限量'],
      ['dailyLimit', '每日限量'],
      ['userTotalLimit', '用户累计限购'],
      ['userDailyLimit', '用户每日限购'],
    ] as const
  ).map(([key, label]): Field => ({
    key,
    label,
    type: 'limit',
    hint: '留空不限，0不可购买；仅微信/支付宝',
  })),
  {
    key: 'startsAt',
    label: '开始销售时间',
    type: 'datetime',
    hint: '设备当地时间，留空不限',
  },
  {
    key: 'endsAt',
    label: '结束销售时间',
    type: 'datetime',
    hint: '设备当地时间，留空不限',
  },
];
export const promotionFields: Field[] = [
  { key: 'title', label: '活动名称', required: true },
  {
    key: 'effect',
    label: '优惠类型',
    type: 'select',
    default: 'bonus_fixed',
    options: [
      { value: 'fixed_discount', label: '满额直减（分）' },
      { value: 'discount_bps', label: '折扣（万分比）' },
      { value: 'bonus_fixed', label: '固定赠分' },
      { value: 'bonus_bps', label: '比例赠分（万分比）' },
      { value: 'bonus_consecutive', label: '连续充值赠送' },
    ],
  },
  {
    key: 'value',
    label: '优惠数值',
    type: 'integer',
    positive: true,
    required: true,
    hint: '比例1000表示10%；折扣9000表示9折。现金减免单位分。',
    visible: (values) => values.effect !== 'bonus_consecutive',
  },
  {
    key: 'maxConsecutiveDays',
    label: '最大天数',
    type: 'number',
    default: '3',
    min: 1,
    max: 366,
    required: true,
    hint: '超过最大天数持续按最后一天额度赠送；中断一天从第1天开始',
    visible: (values) => values.effect === 'bonus_consecutive',
  },
  {
    key: 'consecutiveGrantMode',
    label: '赠送频率',
    type: 'select',
    default: 'daily_first',
    options: [
      { value: 'daily_first', label: '每天首笔赠送（默认）' },
      { value: 'every_order', label: '每单都赠送' },
    ],
    visible: (values) => values.effect === 'bonus_consecutive',
  },
  {
    key: 'dailyBonusPoints',
    label: '逐日赠送积分',
    type: 'daily-bonuses',
    default: ['0', '0', '0'],
    required: true,
    hint: '每一天单独设置，可填0。按同用户、同套餐、北京时间成功充值日统计，同日多单不增加天数；实付金额保持套餐定价。',
    visible: (values) => values.effect === 'bonus_consecutive',
  },
  {
    key: 'eligibility',
    label: '参与条件',
    type: 'select',
    default: 'always',
    options: [
      { value: 'always', label: '所有充值' },
      { value: 'first_user', label: '用户首单' },
      { value: 'first_day', label: '用户每日首单' },
    ],
    hint: '首单仅支持赠分，按服务端首次成功入账判定',
    visible: (values) => values.effect !== 'bonus_consecutive',
  },
  {
    key: 'channels',
    label: '适用渠道',
    type: 'multi',
    required: true,
    default: ['wechat', 'alipay'],
    options: [
      { value: 'wechat', label: '微信' },
      { value: 'alipay', label: '支付宝' },
      { value: 'apple', label: 'Apple' },
      { value: 'google', label: 'Google' },
    ],
  },
  {
    key: 'packageIds',
    label: '适用套餐ID',
    type: 'list',
    hint: '逗号分隔，留空适用所有套餐',
  },
  {
    key: 'minimumMinor',
    label: '最低原价门槛（元）',
    type: 'money',
    default: '0',
    required: true,
    visible: (values) => values.effect !== 'bonus_consecutive',
  },
  { key: 'priority', label: '优先级', type: 'number', default: '0' },
  {
    key: 'requiresCoupon',
    label: '需要券码',
    type: 'boolean',
    default: false,
    visible: (values) => values.effect !== 'bonus_consecutive',
  },
  { key: 'startsAt', label: '活动开始', type: 'datetime', required: true },
  { key: 'endsAt', label: '活动结束', type: 'datetime', required: true },
  ...(
    [
      ['totalUses', '活动总次数'],
      ['userTotalUses', '用户累计次数'],
      ['userDailyUses', '用户每日次数'],
      ['cashBudget', '现金减免预算（分）'],
      ['pointsBudget', '赠分总预算'],
    ] as const
  ).map(([key, label]): Field => ({
    key,
    label,
    type: 'limit',
    hint: '留空不限，0禁用；新版本保留已用额度',
    visible: (values) => key !== 'cashBudget' || values.effect !== 'bonus_consecutive',
  })),
];
export const productFields: Field[] = [
  {
    key: 'versionId',
    label: '套餐版本ID',
    type: 'integer',
    positive: true,
    required: true,
  },
  {
    key: 'channel',
    label: '商店',
    type: 'select',
    default: 'apple',
    options: [
      { value: 'apple', label: 'Apple' },
      { value: 'google', label: 'Google' },
    ],
  },
  { key: 'applicationId', label: '应用ID（Bundle / Package）', required: true },
  {
    key: 'environment',
    label: '环境',
    type: 'select',
    default: 'sandbox',
    options: [
      { value: 'sandbox', label: '沙箱' },
      { value: 'production', label: '生产' },
    ],
  },
  { key: 'productId', label: '商店商品ID', required: true },
];
export const reasonField: Field = {
  key: 'reason',
  label: '操作原因 / 业务凭证',
  type: 'textarea',
  required: true,
};
