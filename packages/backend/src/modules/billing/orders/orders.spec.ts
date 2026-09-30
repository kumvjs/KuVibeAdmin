import { orderFingerprint } from './order.types.js'

describe('订单确认幂等指纹', () => {
  const command = { packageId: '1', versionId: '2', channel: 'wechat' as const, client: 'qr' as const, idempotencyKey: 'same', payableMinor: '100', couponCode: 'COUPON_1' }
  it('券码大小写同义，套餐版本、金额、渠道及客户端不同须冲突', () => {
    expect(orderFingerprint(command)).toBe(orderFingerprint({ ...command, couponCode: 'coupon_1' }))
    for (const changes of [{ versionId: '3' }, { payableMinor: '101' }, { client: 'app' as const }, { channel: 'alipay' as const }])
      expect(orderFingerprint(command)).not.toBe(orderFingerprint({ ...command, ...changes }))
  })
})
