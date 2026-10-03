import { Environment, Type } from '@apple/app-store-server-library'
import { OrdersService } from '../orders/orders.service.js'
import { AppleProvider } from './apple.provider.js'
import { googleOrderAmount, minorToDecimal } from './payment.types.js'

describe('商店金额与Apple无绑定验真事实', () => {
  it('现金渠道金额范围在预占前校验，支付宝分转元不经浮点', () => {
    const orders = new OrdersService({} as never, {} as never, {} as never, {} as never)
    const command = { packageId: '1', versionId: '1', channel: 'wechat', client: 'qr', idempotencyKey: 'money', payableMinor: '2147483647' }
    expect(() => (orders as any).validate(command)).not.toThrow()
    expect(() => (orders as any).validate({ ...command, payableMinor: '2147483648' })).toThrow()
    expect(() => (orders as any).validate({ ...command, channel: 'alipay', payableMinor: '10000000000' })).not.toThrow()
    expect(() => (orders as any).validate({ ...command, channel: 'alipay', payableMinor: '10000000001' })).toThrow()
    expect(() => (orders as any).validate({ ...command, payableMinor: '0' })).toThrow()
    expect(minorToDecimal('990')).toBe('9.90')
  })
  it('google Money保留纳单位精度、大整数和零金额', () => {
    expect(googleOrderAmount({ currencyCode: 'CNY', units: '9', nanos: 900000000 })).toEqual({ value: '9900000000', scale: 9, currency: 'CNY', source: 'google_order' })
    expect(googleOrderAmount({ currencyCode: 'JPY', units: '9007199254740993', nanos: 1 }).value).toBe('9007199254740993000000001')
    expect(googleOrderAmount({ currencyCode: 'USD' }).value).toBe('0')
    for (const money of [{ currencyCode: 'CNY', units: 9 }, { currencyCode: 'CNY', units: '-1' }, { currencyCode: 'CNY', nanos: 1000000000 }, { currencyCode: 'CNY', nanos: 0.1 }, { currencyCode: 'cny' }])
      expect(() => googleOrderAmount(money)).toThrow()
  })

  it('已验签Apple字段可缺绑定，金额是milliunits且不伪造CNY分', () => {
    const provider = new AppleProvider({} as never)
    const data = { environment: Environment.PRODUCTION, bundleId: 'test.app', transactionId: '123456789', productId: 'price_9_9', type: Type.CONSUMABLE, inAppOwnershipType: 'PURCHASED', quantity: 1, purchaseDate: Date.now(), price: 9900, currency: 'CNY' }
    // 此处只检验已验签数据的领域转换，真实JWS/证书链仍需商店联调。
    const payment = (provider as any).transaction(data, 'fixture-hash')
    expect(payment.bindingToken).toBeNull()
    expect(payment.amountMinor).toBeNull()
    expect(payment.platformAmount).toEqual({ value: '9900', scale: 3, currency: 'CNY', source: 'apple_transaction' })
    expect(() => (provider as any).transaction({ ...data, type: Type.NON_CONSUMABLE }, 'fixture-hash')).toThrow()
  })
})
