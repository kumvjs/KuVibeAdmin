import { requestClient } from '#/api/request';

export type Channel = 'alipay' | 'apple' | 'google' | 'wechat';
export type OrderStatus =
  | 'closed'
  | 'closing'
  | 'paid'
  | 'pending'
  | 'refund_pending'
  | 'refunded'
  | 'review';
export interface CursorPage<T> {
  items: T[];
  nextCursor: null | string;
}
export interface NumberPage<T> {
  items: T[];
  total: number;
}
export interface PointAccount {
  accountId: null | string;
  available: string;
  frozen: string;
  sequence: string;
  status: 'active' | 'blocked';
  userId: string;
}
export interface PointLedger {
  action: string;
  actorId: null | string;
  amount: string;
  availableAfter: string;
  availableBefore: string;
  availableDelta: string;
  businessKey: string;
  businessType: string;
  createdAt: string;
  frozenAfter: string;
  frozenBefore: string;
  frozenDelta: string;
  holdId: null | string;
  id: string;
  reason: string;
  referenceId: null | string;
  sequence: string;
}
export interface RechargePackage {
  basePoints: string;
  code: string;
  dailyLimit: null | string;
  endsAt: null | string;
  giftPoints: string;
  id: string;
  priceMinor: string;
  revision: number;
  startsAt: null | string;
  status: string;
  title: string;
  totalLimit: null | string;
  userDailyLimit: null | string;
  userTotalLimit: null | string;
  versionId: string;
}
export interface Promotion {
  maxConsecutiveDays?: number;
  dailyBonusPoints?: string[];
  consecutiveGrantMode?: 'daily_first' | 'every_order';
  cashBudget: null | string;
  channels: Channel[];
  code: string;
  effect: string;
  eligibility: string;
  endsAt: string;
  id: string;
  minimumMinor: string;
  packageIds: string[];
  pointsBudget: null | string;
  priority: number;
  requiresCoupon: boolean;
  revision: number;
  startsAt: string;
  status: string;
  title: string;
  totalUses: null | string;
  userDailyUses: null | string;
  userTotalUses: null | string;
  value: string;
  versionId: string;
}
export interface ChannelProduct {
  applicationId: string;
  channel: 'apple' | 'google';
  environment: string;
  id: string;
  productId: string;
  versionId: string;
}
export interface Quote {
  consecutiveRechargeDays: number;
  firstPackageRechargeToday: boolean;
  basePoints: string;
  channel: Channel;
  currency: null | string;
  estimatedBonusPoints: string;
  guaranteedBonusPoints: string;
  notice: string;
  packageGiftPoints: string;
  packageId: string;
  payableMinor: null | string;
  versionId: string;
}
export interface Order {
  basePoints: string;
  channel: Channel;
  client: string;
  closedAt: null | string;
  createdAt: string;
  currency: null | string;
  expiresAt: null | string;
  giftPoints: string;
  guaranteedBonusPoints: string;
  id: string;
  merchantNo: string;
  packageId: string;
  payableMinor: null | string;
  productId: null | string;
  settledAt: null | string;
  settlement: null | {
    basePoints: string;
    bonusPoints: string;
    giftLedgerId: null | string;
    giftPoints: string;
    paidLedgerId: string;
  };
  status: OrderStatus;
  title: string;
  userId: string;
  versionId: string;
}
export interface Payment {
  orderId: string;
  parameters: null | Record<string, string>;
  status: string;
}
export interface Finding {
  actual?: string;
  code: string;
  expected?: string;
}
export interface Reconciliation {
  createdAt: string;
  findings: Finding[] | null;
  id: string;
  reason: string;
  status: string;
  verifyChannel: boolean;
}
export interface Refund {
  amountMinor: null | string;
  createdAt: string;
  gapPoints: string;
  id: string;
  reason: string;
  recoveredPoints: string;
  refundNo: string;
  sourcePoints: string;
  status: string;
}
export interface Risk {
  gapPoints: string;
  id: string;
  orderId: string;
  resolutionReason: null | string;
  status: string;
  type: string;
  userId: string;
}
export type Body = Record<string, unknown>;
export type Params = Record<string, number | string | undefined>;

const pointPath = (userId?: string) =>
  userId ? `/system/points/${encodeURIComponent(userId)}` : '/points';
export const getPointAccount = (userId?: string) =>
  requestClient.get<PointAccount>(`${pointPath(userId)}/account`);
export const getPointLedger = (params: Params, userId?: string) =>
  requestClient.get<CursorPage<PointLedger>>(`${pointPath(userId)}/ledger`, {
    params,
  });
export const mutatePoints = (userId: string, action: string, data: Body) =>
  requestClient.post<PointLedger>(`${pointPath(userId)}/${action}`, data);
export const getPackages = (params: Params, admin = false) =>
  requestClient.get<NumberPage<RechargePackage>>(
    admin ? '/system/billing/packages' : '/recharge/packages',
    { params },
  );
export const savePackage = (data: Body, id?: string) =>
  requestClient.post<RechargePackage>(
    id ? `/system/billing/packages/${id}/versions` : '/system/billing/packages',
    data,
  );
export const publishPackage = (id: string, status: string) =>
  requestClient.post(`/system/billing/packages/${id}/status`, { status });
export const getProducts = (versionId: string) =>
  requestClient.get<ChannelProduct[]>(
    `/recharge/packages/versions/${versionId}/products`,
  );
export const saveProduct = (data: Body) =>
  requestClient.post<ChannelProduct>('/system/billing/products', data);
export const getPromotions = (params: Params) =>
  requestClient.get<NumberPage<Promotion>>('/system/billing/promotions', {
    params,
  });
export const savePromotion = (data: Body, id?: string) =>
  requestClient.post<Promotion>(
    id
      ? `/system/billing/promotions/${id}/versions`
      : '/system/billing/promotions',
    data,
  );
export const publishPromotion = (id: string, status: string) =>
  requestClient.post(`/system/billing/promotions/${id}/status`, { status });
export const issueCoupon = (data: Body) =>
  requestClient.post<{ id: string }>('/system/billing/coupons', data);
export const getQuote = (id: string, params: Params) =>
  requestClient.get<Quote>(`/recharge/packages/${id}/quote`, { params });
export const createOrder = (data: Body) =>
  requestClient.post<Order>('/recharge/orders', data);
export const getOrders = (params: Params, admin = false) =>
  requestClient.get<CursorPage<Order>>(
    admin ? '/system/billing/orders' : '/recharge/orders',
    { params },
  );
export const getOrder = (id: string, admin = false) =>
  requestClient.get<Order>(
    `${admin ? '/system/billing' : '/recharge'}/orders/${id}`,
  );
export const cancelOrder = (id: string) =>
  requestClient.post<Order>(`/recharge/orders/${id}/cancel`, {});
export const preparePayment = (id: string) =>
  requestClient.post<Payment>(`/recharge/orders/${id}/payment`, {});
export const refundOrder = (id: string, data: Body) =>
  requestClient.post<Refund>(`/system/billing/orders/${id}/refund`, data);
export const reconcileOrder = (id: string, data: Body) =>
  requestClient.post<Reconciliation>(
    `/system/billing/orders/${id}/reconcile`,
    data,
  );
export const getRefunds = (id: string) =>
  requestClient.get<Refund[]>(`/system/billing/orders/${id}/refunds`);
export const getReconciliations = (id: string) =>
  requestClient.get<Reconciliation[]>(
    `/system/billing/orders/${id}/reconciliations`,
  );
export const getRisks = (userId: string) =>
  requestClient.get<Risk[]>(`/system/billing/risks/user/${userId}`);
export const resolveRisk = (id: string, reason: string) =>
  requestClient.post<Risk>(`/system/billing/risks/${id}/resolve`, { reason });
