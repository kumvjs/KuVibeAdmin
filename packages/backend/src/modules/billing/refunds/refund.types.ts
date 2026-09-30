export interface RefundCommand { idempotencyKey: string, reason: string }
export interface ProviderRefund {
  channel: 'wechat' | 'alipay'
  merchantId: string
  environment: 'sandbox' | 'production'
  merchantNo: string
  transactionKey: string
  refundNo: string
  refundKey: string
  originalMinor: string
  refundMinor: string
  currency: 'CNY'
  state: 'succeeded' | 'closed' | 'processing' | 'review'
  evidenceHash: string
}
