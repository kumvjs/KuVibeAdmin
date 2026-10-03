import type { InboxPayload } from './entities/payment-inbox.entity.js'
import type { PaymentBinding, ProviderPayment } from './payment.types.js'
import { createHash, randomUUID } from 'node:crypto'
import { ReceiptUtility } from '@apple/app-store-server-library'
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CatalogService } from '../catalog/catalog.service.js'
import { RechargeUserStateEntity } from '../catalog/entities/recharge-user-state.entity.js'
import { RechargeOrderEntity } from '../orders/entities/recharge-order.entity.js'
import { OrdersService } from '../orders/orders.service.js'
import { BillingOutboxService } from '../orders/outbox.service.js'
import { positiveInteger } from '../points/points.types.js'
import { RefundsService } from '../refunds/refunds.service.js'
import { billingTransaction } from '../shared/billing-transaction.js'
import { AlipayProvider } from './alipay.provider.js'
import { AppleProvider } from './apple.provider.js'
import { PaymentAttemptEntity, StoreIdentityEntity } from './entities/payment-attempt.entity.js'
import { PaymentInboxEntity } from './entities/payment-inbox.entity.js'
import { PaymentTransactionEntity } from './entities/payment-transaction.entity.js'
import { GoogleProvider } from './google.provider.js'
import { PaymentSecretsService } from './payment-secrets.service.js'
import { recordPayment } from './payment-transactions.js'
import { ChannelPendingError } from './payment.types.js'
import { SettlementService } from './settlement.service.js'
import { WechatProvider } from './wechat.provider.js'

@Injectable()
export class PaymentsService {
  constructor(private readonly source: DataSource, private readonly catalog: CatalogService, private readonly orders: OrdersService, private readonly outbox: BillingOutboxService, private readonly settlement: SettlementService, private readonly wechat: WechatProvider, private readonly alipay: AlipayProvider, private readonly apple: AppleProvider, private readonly google: GoogleProvider, private readonly secrets: PaymentSecretsService, private readonly refunds?: RefundsService) {}

  async prepare(userId: string, id: string) {
    positiveInteger(id, 'orderId')
    return billingTransaction(this.source, async (manager) => {
      await this.catalog.requireUser(manager, userId)
      await this.orders.lockUserState(manager, userId)
      const order = await this.orders.lockOrder(manager, id, userId)
      const [{ expired }] = await manager.query('SELECT $1::timestamptz <= NOW() AS expired', [order.expiresAt])
      if (order.status !== 'pending' || expired)
        throw new ConflictException('订单已结束或到期，不能继续发起支付')
      const binding = this.binding(order)
      const iap = ['apple', 'google'].includes(order.channel)
      let attempt = await manager.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
      if (!attempt) {
        if (iap) {
          const identities = manager.getRepository(StoreIdentityEntity)
          await identities.createQueryBuilder().insert().values({ userId, token: randomUUID() }).orIgnore().execute()
          binding.storeAccountId = (await identities.findOneByOrFail({ userId, tenantId: '1' })).token
          if (order.channel === 'google')
            binding.googleOrderMode = 'account'
        }
        attempt = await manager.getRepository(PaymentAttemptEntity).save({ orderId: id, binding, storeToken: randomUUID(), status: 'queued' })
        if (iap) {
          const parameters = { productId: order.snapshot.productId!, applicationId: binding.applicationId, environment: binding.environment, ...(order.channel === 'apple' ? { appAccountToken: attempt.storeToken } : { obfuscatedAccountId: binding.storeAccountId! }) }
          await manager.getRepository(PaymentAttemptEntity).update(attempt.id, { status: 'starting' })
          await manager.getRepository(PaymentAttemptEntity).update(attempt.id, { status: 'ready', parameters })
          await manager.getRepository(RechargeOrderEntity).update(id, { paymentInitiated: true })
          attempt.status = 'ready'
          attempt.parameters = parameters
        }
        else {
          await this.outbox.enqueue(manager, 'payment_prepare', id, `order:${id}:prepare`)
          await this.outbox.enqueue(manager, 'payment_poll', id, `order:${id}:poll`, new Date(Date.now() + 10000))
        }
      }
      else {
        this.assertBinding(attempt.binding, binding)
      }
      return { orderId: id, status: attempt.status, parameters: attempt.status === 'ready' ? attempt.parameters : null }
    })
  }

  async acceptCash(payment: ProviderPayment) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneBy({ merchantNo: payment.merchantNo!, channel: payment.channel, tenantId: '1' })
    return this.inbox(payment.channel, payment.evidenceHash, order?.id ?? null, { payment })
  }

  async acceptWechatRefund(proof: { merchantNo: string, refundNo: string, evidenceHash: string }) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneBy({ merchantNo: proof.merchantNo, channel: 'wechat' })
    return this.inbox('wechat', proof.evidenceHash, order?.id ?? null, { refundNo: proof.refundNo })
  }

  async inbox(channel: ProviderPayment['channel'], hash: string, orderId: string | null, payload: InboxPayload) {
    return billingTransaction(this.source, async (manager) => {
      const repository = manager.getRepository(PaymentInboxEntity)
      const resolvable = orderId || payload.transactionId || payload.secret || payload.payment
      await repository.createQueryBuilder().insert().values({ channel, evidenceHash: hash, orderId, payload, status: resolvable ? 'pending' : 'review', reason: resolvable ? null : 'unmatched_order' }).orIgnore().execute()
      const row = await repository.findOneByOrFail({ channel, evidenceHash: hash })
      if (row.orderId !== orderId)
        throw new ConflictException('同一支付凭据已绑定其他订单')
      if (row.status === 'pending')
        await this.outbox.enqueue(manager, 'payment_inbox', row.id, `inbox:${row.id}`)
      return { inboxId: row.id, status: row.status }
    })
  }

  async processInbox(id: string, force = false) {
    const row = await this.source.getRepository(PaymentInboxEntity).findOneByOrFail({ id })
    if (row.status === 'done' && !force)
      return
    if (row.channel === 'wechat' && row.payload.refundNo) {
      if (!row.orderId || !this.refunds)
        throw new Error('退款通知缺少已绑定订单或处理器')
      await this.refunds.processNotification(row.orderId, row.payload.refundNo, row.id)
      return
    }
    let payment = row.payload.payment
    if (row.channel === 'apple')
      payment = await this.apple.query(row.payload.applicationId!, row.payload.environment!, row.payload.transactionId!)
    if (row.channel === 'google') {
      const token = this.secrets.open(row.payload.secret!, `google:${row.payload.applicationId}`)
      const hint = row.orderId ? await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: row.orderId }) : null
      // RTDN没有可靠测试环境字段，依次尝试本地启用的两套环境；验真仍必须匹配服务端testPurchaseContext。
      if (hint) {
        payment = (await this.google.query(row.payload.applicationId!, hint.snapshot.environment!, token)).payment
      }
      else {
        let failure: unknown
        for (const environment of ['production', 'sandbox']) {
          try {
            payment = (await this.google.query(row.payload.applicationId!, environment, token)).payment
            break
          }
          catch (error) {
            failure = error
          }
        }
        if (!payment)
          throw failure
      }
      if (row.payload.refundScope)
        payment = { ...payment!, state: 'refunded', refundScope: row.payload.refundScope }
    }
    if (!payment)
      throw new Error('通知缺少可验证凭据')
    // 商店撤销后可能不再返回购买绑定；只能用已持久化且相同的交易身份补充缺失字段。
    const transaction = await billingTransaction(this.source, manager => recordPayment(manager, payment!, id))
    payment = transaction.latestFacts ?? transaction.facts
    if (payment.channel === 'google' && payment.platformOrderId && !payment.platformAmount)
      await billingTransaction(this.source, manager => this.outbox.enqueue(manager, 'payment_amount', transaction.id, `transaction:${transaction.id}:amount`))
    if (row.channel === 'apple' && row.payload.notificationType && !['ONE_TIME_CHARGE', 'REFUND', 'REVOKE'].includes(row.payload.notificationType)) {
      if (transaction.status !== 'fulfilled')
        await this.source.getRepository(PaymentTransactionEntity).update(transaction.id, { status: 'review', reason: 'store_event_requires_manual_review' })
      if (row.status !== 'done')
        await this.source.getRepository(PaymentInboxEntity).update(id, { status: 'review', reason: 'store_event_requires_manual_review' })
      return
    }
    const known = payment.state === 'refunded' && transaction.orderId ? transaction : null
    if (known && known.facts.applicationId === payment.applicationId && known.facts.environment === payment.environment && known.facts.merchantId === payment.merchantId)
      payment = { ...payment, productId: payment.productId ?? known.facts.productId, bindingToken: payment.bindingToken ?? known.facts.bindingToken, storeAccountId: payment.storeAccountId ?? known.facts.storeAccountId }
    const uuidBinding = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payment.bindingToken ?? '')
    const attempt = !row.orderId && uuidBinding ? await this.source.getRepository(PaymentAttemptEntity).findOneBy({ storeToken: payment.bindingToken! }) : null
    const orderId = row.orderId ?? (attempt?.binding.googleOrderMode === 'account' ? null : attempt?.orderId) ?? transaction.orderId
    if (payment.state === 'pending') {
      if (Date.now() - transaction.createdAt.getTime() >= 3 * 86400000) {
        if (row.status !== 'done')
          await this.source.getRepository(PaymentInboxEntity).update(id, { status: 'review', reason: 'pending_purchase_requires_review' })
        await this.source.getRepository(PaymentTransactionEntity).update(transaction.id, { status: 'review', reason: 'pending_purchase_requires_review' })
        return
      }
      throw new ChannelPendingError('商店待付款，保留任务，不提前入账或消费确认')
    }
    if (!orderId) {
      if (row.status !== 'done')
        await this.source.getRepository(PaymentInboxEntity).update(id, { status: 'review', reason: 'missing_store_order_binding' })
      await billingTransaction(this.source, manager => this.outbox.enqueue(manager, 'payment_recover', transaction.id, `transaction:${transaction.id}:recover`, new Date(Date.now() + 60000)))
      return
    }
    const result = await this.settlement.settle(orderId, payment, row.status === 'done' ? null : id)
    if (result.status === 'pending')
      throw new ChannelPendingError('商店待付款，保留任务，不提前入账或消费确认')
  }

  /** 无订单补报只记录申报人，不把客户端登录态当作商店购买归属。 */
  async restore(userId: string, channel: 'apple' | 'google', input: { applicationId: string, environment: 'sandbox' | 'production', transactionId?: string, transactionReceipt?: string, purchaseToken?: string }) {
    await billingTransaction(this.source, manager => this.catalog.requireUser(manager, userId))
    if (channel === 'apple') {
      this.apple.binding(input.applicationId, input.environment)
      let transactionId = input.transactionId
      if (!transactionId && input.transactionReceipt) {
        try {
          transactionId = new ReceiptUtility().extractTransactionIdFromAppReceipt(input.transactionReceipt) ?? undefined
        }
        catch {
          throw new ConflictException('Apple收据无法提取交易ID，请重报原交易标识')
        }
      }
      if (!/^\d{1,64}$/.test(transactionId ?? ''))
        throw new ConflictException('必须提供Apple交易ID或可提取交易ID的收据')
      return this.inbox(channel, createHash('sha256').update(`apple:restore:${input.applicationId}:${input.environment}:${transactionId}`).digest('hex'), null, { transactionId, applicationId: input.applicationId, environment: input.environment, reportedUserId: userId })
    }
    this.google.binding(input.applicationId, input.environment)
    if (!/^[\w.:-]{1,4096}$/.test(input.purchaseToken ?? ''))
      throw new ConflictException('必须提供Google购买token')
    return this.inbox(channel, createHash('sha256').update(`google:restore:${input.applicationId}:${input.purchaseToken}`).digest('hex'), null, { applicationId: input.applicationId, environment: input.environment, reportedUserId: userId, secret: this.secrets.seal(input.purchaseToken!, `google:${input.applicationId}`) })
  }

  async recoverTransaction(id: string, automatic = true) {
    const transaction = await this.source.getRepository(PaymentTransactionEntity).findOneByOrFail({ id, tenantId: '1' })
    if (!transaction.inboxId || !['apple', 'google'].includes(transaction.channel))
      return
    await this.processInbox(transaction.inboxId, true)
    const current = await this.source.getRepository(PaymentTransactionEntity).findOneByOrFail({ id })
    // 自动恢复最多三天，之后保留记录供客服主动复查；已履约仍接收后续退款通知。
    if (automatic && current.orderId === null && Date.now() - current.createdAt.getTime() < 3 * 86400000)
      throw new ChannelPendingError('平台交易待关联，继续恢复匹配')
  }

  async recoverAmount(id: string) {
    const row = await this.source.getRepository(PaymentTransactionEntity).findOneByOrFail({ id, tenantId: '1' })
    if (row.channel !== 'google' || !row.inboxId || row.latestFacts?.platformAmount)
      return
    const inbox = await this.source.getRepository(PaymentInboxEntity).findOneByOrFail({ id: row.inboxId })
    const token = this.secrets.open(inbox.payload.secret!, `google:${row.facts.applicationId}`)
    const result = await this.google.query(row.facts.applicationId, row.facts.environment, token)
    await billingTransaction(this.source, manager => recordPayment(manager, result.payment, row.inboxId))
    // 金额补查若发现撤销/退款，仍走统一账务恢复，不只更新显示字段。
    await this.processInbox(row.inboxId, true)
    if (!result.payment.platformAmount)
      throw new Error('google_amount_unavailable')
  }

  async transactions(filters: { channel?: string, status?: string, transactionKey?: string, cursor?: string, limit?: number }) {
    const limit = filters.limit ?? 20
    if (filters.cursor)
      positiveInteger(filters.cursor, 'cursor')
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ConflictException('分页数量必须为1到100')
    const builder = this.source.getRepository(PaymentTransactionEntity).createQueryBuilder('payment').where('payment.tenantId=1')
    for (const key of ['channel', 'status', 'transactionKey'] as const) {
      if (filters[key])
        builder.andWhere(`payment.${key}=:${key}`, { [key]: filters[key] })
    }
    if (filters.cursor)
      builder.andWhere('payment.id<:cursor', { cursor: filters.cursor })
    const rows = await builder.orderBy('payment.id', 'DESC').take(limit + 1).getMany()
    return { items: rows.slice(0, limit).map(row => this.transactionResult(row)), nextCursor: rows.length > limit ? rows[limit - 1].id : null }
  }

  async requestRecovery(id: string, actorId: string, reason: string) {
    positiveInteger(id, 'paymentId')
    if (!reason.trim() || reason.length > 500)
      throw new ConflictException('重新验真须填写核查原因')
    const row = await this.source.getRepository(PaymentTransactionEntity).findOneBy({ id, tenantId: '1' })
    if (!row)
      throw new NotFoundException('平台支付流水不存在')
    if (!['apple', 'google'].includes(row.channel))
      throw new ConflictException('现金支付请通过业务订单发起渠道对账')
    await billingTransaction(this.source, manager => this.outbox.enqueue(manager, 'payment_recheck', id, `transaction:${id}:recheck:${randomUUID()}`, undefined, { actorId, reason }))
    return { id, status: 'queued' }
  }

  async bindTransaction(id: string, orderId: string, actorId: string, reason: string) {
    positiveInteger(id, 'paymentId')
    positiveInteger(orderId, 'orderId')
    if (!reason.trim() || reason.length > 500)
      throw new ConflictException('人工关联必须填写核实归属的依据')
    const hint = await this.source.getRepository(RechargeOrderEntity).findOneBy({ id: orderId, tenantId: '1' })
    if (!hint)
      throw new NotFoundException('业务订单不存在')
    await billingTransaction(this.source, async (manager) => {
      await this.catalog.requireUser(manager, hint.userId)
      await this.orders.lockUserState(manager, hint.userId)
      const order = await this.orders.lockOrder(manager, orderId, hint.userId)
      const attempt = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId })
      const row = await manager.getRepository(PaymentTransactionEntity).findOneBy({ id, tenantId: '1' })
      if (!row)
        throw new NotFoundException('平台支付流水不存在')
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${row.channel}:${row.transactionKey}`])
      const current = await manager.getRepository(PaymentTransactionEntity).findOneByOrFail({ id })
      if (current.manualBinding?.orderId === orderId)
        return
      const facts = current.latestFacts ?? current.facts
      const [{ expired }] = await manager.query('SELECT $1::timestamptz <= clock_timestamp() AS expired', [order.expiresAt])
      if (current.orderId !== null || current.manualBinding || !['apple', 'google'].includes(order.channel) || order.status !== 'pending' || expired || order.paidLedgerId || facts.state !== 'paid'
        || facts.channel !== order.channel || facts.applicationId !== attempt.binding.applicationId || facts.environment !== attempt.binding.environment || facts.productId !== order.snapshot.productId || facts.quantity !== '1'
        || (facts.bindingToken !== null && facts.bindingToken !== attempt.storeToken) || (order.channel === 'google' && facts.storeAccountId && facts.storeAccountId !== attempt.binding.storeAccountId)) {
        throw new ConflictException('仅可人工确认无矛盾绑定的单件付款与有效未入账订单；已关联、退款或迟到旧单不能改绑')
      }
      if (await manager.getRepository(PaymentTransactionEntity).existsBy({ orderId }))
        throw new ConflictException('该订单已关联其他交易')
      await manager.getRepository(PaymentTransactionEntity).update(id, { orderId, status: 'matched', reason: null, manualBinding: { orderId, actorId, reason } })
      await this.orders.event(manager, orderId, 'payment_manual_binding', actorId, `平台流水#${id}；${reason}`)
      await this.outbox.enqueue(manager, 'payment_recheck', id, `transaction:${id}:manual-bind`, undefined, { actorId, reason })
    })
    return this.transactionResult(await this.source.getRepository(PaymentTransactionEntity).findOneByOrFail({ id }))
  }

  private transactionResult(row: PaymentTransactionEntity) {
    const facts = row.latestFacts ?? row.facts
    return { id: row.id, orderId: row.orderId, channel: row.channel, transactionKey: row.transactionKey, productId: facts.productId, applicationId: facts.applicationId, environment: facts.environment, platformState: facts.state, amountMinor: facts.amountMinor, platformAmount: facts.platformAmount ?? null, platformOrderId: facts.platformOrderId ?? null, currency: facts.currency, quantity: facts.quantity, paidAt: facts.paidAt, status: row.status, reason: row.reason, createdAt: row.createdAt, verifiedAt: row.verifiedAt, manualBinding: row.manualBinding }
  }

  async receipt(userId: string, id: string, input: { transactionId?: string, purchaseToken?: string }) {
    const order = await this.ownOrder(userId, id)
    const attempt = await this.source.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
    if (!attempt || attempt.status !== 'ready' || !['apple', 'google'].includes(order.channel))
      throw new ConflictException('请先获取该内购订单绑定参数')
    this.assertBinding(attempt.binding, this.binding(order))
    if (order.channel === 'apple') {
      if (!/^\d{1,64}$/.test(input.transactionId ?? '') || input.purchaseToken)
        throw new ConflictException('Apple仅接受transactionId，服务端查单并验签')
      const hash = createHash('sha256').update(`apple:${id}:${input.transactionId}`).digest('hex')
      return this.inbox('apple', hash, id, { transactionId: input.transactionId, applicationId: attempt.binding.applicationId, environment: attempt.binding.environment })
    }
    if (!/^[\w.:-]{1,4096}$/.test(input.purchaseToken ?? '') || input.transactionId)
      throw new ConflictException('Google仅接受受限长度的purchaseToken')
    const hash = createHash('sha256').update(`google:${id}:${input.purchaseToken}`).digest('hex')
    return this.inbox('google', hash, id, { secret: this.secrets.seal(input.purchaseToken!, `google:${attempt.binding.applicationId}`), applicationId: attempt.binding.applicationId, environment: attempt.binding.environment })
  }

  async acceptApple(signedPayload: string) {
    const notification = await this.apple.notification(signedPayload)
    const transactionId = notification.payment?.transactionKey.split(':').at(-1)
    return this.inbox('apple', notification.hash, null, { transactionId, applicationId: notification.applicationId, environment: notification.environment, notificationType: notification.type, ...(notification.payment?.refundScope ? { refundScope: notification.payment.refundScope } : {}) })
  }

  async acceptGoogle(body: unknown, authorization?: string) {
    const notification = await this.google.notification(body, authorization)
    return this.inbox('google', notification.hash, null, { applicationId: notification.applicationId, notificationType: notification.type, ...(notification.noticeData ? { notice: this.secrets.seal(notification.noticeData, `google-notification:${notification.applicationId}`) } : {}), ...(notification.token ? { secret: this.secrets.seal(notification.token, `google:${notification.applicationId}`) } : {}), ...(notification.refundScope ? { refundScope: notification.refundScope } : {}) })
  }

  async consume(id: string) {
    const inbox = await this.source.getRepository(PaymentInboxEntity).findOneByOrFail({ id })
    if (!inbox.payload.secret)
      throw new ConflictException('Google消费确认必须先持久化购买凭据')
    const token = this.secrets.open(inbox.payload.secret, `google:${inbox.payload.applicationId}`)
    const transaction = await this.source.query('SELECT order_id::text FROM biz_payment_transaction WHERE channel=\'google\' AND transaction_key=$1 AND status=\'fulfilled\'', [createHash('sha256').update(token).digest('hex')])
    if (!transaction.length)
      throw new ConflictException('Google消费确认必须先持久化入账交易')
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id: transaction[0].order_id })
    if (!order.paidLedgerId)
      throw new ConflictException('Google尚未持久化积分入账，不能消费确认')
    await this.google.consume(inbox.payload.applicationId!, order.snapshot.environment!, order.snapshot.productId!, token)
  }

  async reconcile(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    const attempt = await this.source.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
    if (!attempt)
      throw new ChannelPendingError('订单尚无渠道发起事实，无法核对渠道')
    this.assertBinding(attempt.binding, this.binding(order))
    let payment: ProviderPayment
    if (['wechat', 'alipay'].includes(order.channel)) {
      payment = await this.provider(order).query(order.merchantNo)
    }
    else {
      const transaction = await this.source.getRepository(PaymentTransactionEntity).findOneBy({ orderId: id })
      const inbox = transaction?.inboxId ? await this.source.getRepository(PaymentInboxEntity).findOneBy({ id: transaction.inboxId }) : await this.source.getRepository(PaymentInboxEntity).findOne({ where: { orderId: id }, order: { id: 'DESC' } })
      if (!inbox)
        throw new ChannelPendingError('商店订单尚无可验真凭据')
      if (order.channel === 'apple') {
        const transactionId = transaction?.transactionKey.split(':').at(-1) ?? inbox.payload.transactionId
        if (!transactionId)
          throw new ChannelPendingError('Apple缺少交易凭据')
        payment = await this.apple.query(attempt.binding.applicationId, attempt.binding.environment, transactionId)
      }
      else {
        if (!inbox.payload.secret)
          throw new ChannelPendingError('Google缺少可解密购买凭据')
        payment = (await this.google.query(attempt.binding.applicationId, attempt.binding.environment, this.secrets.open(inbox.payload.secret, `google:${attempt.binding.applicationId}`))).payment
        if (transaction && payment.state === 'refunded')
          payment = { ...payment, productId: payment.productId ?? transaction.facts.productId, bindingToken: payment.bindingToken ?? transaction.facts.bindingToken, storeAccountId: payment.storeAccountId ?? transaction.facts.storeAccountId }
      }
    }
    if (payment.state === 'pending')
      throw new ChannelPendingError('渠道仍待付款或状态不一致，未完成对账')
    const result = await this.settlement.settle(id, payment)
    if (result.status === 'review')
      throw new ConflictException('渠道事实须人工复核，不能标记对账一致')
  }

  async processPrepare(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    const attempt = await billingTransaction(this.source, async (manager) => {
      await this.lockHistoricalUser(manager, order.userId)
      await this.orders.lockUserState(manager, order.userId)
      const locked = await this.orders.lockOrder(manager, id, order.userId)
      const row = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ orderId: id })
      if (locked.status !== 'pending' || row.status === 'ready' || row.status === 'cancelled')
        return null
      const [{ expired }] = await manager.query('SELECT $1::timestamptz <= NOW() AS expired', [locked.expiresAt])
      if (expired)
        return null
      this.assertBinding(row.binding, this.binding(locked))
      await manager.getRepository(PaymentAttemptEntity).update(row.id, { status: 'starting' })
      await manager.getRepository(RechargeOrderEntity).update(id, { paymentInitiated: true })
      return row
    })
    if (!attempt)
      return
    // 网络请求绝不持有用户、订单或积分行锁；渠道使用固定merchantNo重试。
    const parameters = order.channel === 'wechat' ? await this.wechat.prepare(order, attempt.binding) : await this.alipay.prepare(order)
    await billingTransaction(this.source, async (manager) => {
      await this.lockHistoricalUser(manager, order.userId)
      await this.orders.lockUserState(manager, order.userId)
      await this.orders.lockOrder(manager, id, order.userId)
      const row = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ id: attempt.id })
      if (row.status === 'starting')
        await manager.getRepository(PaymentAttemptEntity).update(row.id, { status: 'ready', parameters })
    })
  }

  async poll(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    if (!['pending', 'closing'].includes(order.status))
      return
    const attempt = await this.source.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
    if (!attempt || attempt.status === 'queued')
      throw new ChannelPendingError('尚未向渠道发起支付')
    this.assertBinding(attempt.binding, this.binding(order))
    const payment = await this.provider(order).query(order.merchantNo)
    if (payment.state === 'paid' || payment.state === 'refunded') {
      await this.acceptCash(payment)
      return
    }
    if (order.status === 'closing') {
      await this.close(id)
      return
    }
    throw new ChannelPendingError('渠道尚未确认支付成功')
  }

  async close(id: string) {
    const order = await this.source.getRepository(RechargeOrderEntity).findOneByOrFail({ id })
    if (order.status !== 'closing')
      return
    const attempt = await this.source.getRepository(PaymentAttemptEntity).findOneBy({ orderId: id })
    if (!attempt)
      throw new ServiceUnavailableException('历史订单缺少渠道身份凭据，保留预占并人工核查')
    if (attempt.status !== 'queued' && attempt.status !== 'cancelled') {
      this.assertBinding(attempt.binding, this.binding(order))
      const provider = this.provider(order)
      let payment = await provider.query(order.merchantNo)
      if (payment.state === 'pending') {
        await provider.close(order.merchantNo)
        payment = await provider.query(order.merchantNo)
      }
      if (payment.state === 'paid' || payment.state === 'refunded') {
        await this.acceptCash(payment)
        return
      }
      if (payment.state !== 'closed' || payment.merchantNo !== order.merchantNo || payment.applicationId !== attempt.binding.applicationId || payment.merchantId !== attempt.binding.merchantId || payment.environment !== attempt.binding.environment)
        throw new ChannelPendingError('渠道未确认同一商户、应用和订单关单，保留预占')
    }
    await billingTransaction(this.source, async (manager) => {
      await this.lockHistoricalUser(manager, order.userId)
      const state = await this.orders.lockUserState(manager, order.userId)
      const locked = await this.orders.lockOrder(manager, id, order.userId)
      if (locked.status !== 'closing')
        return
      const current = await manager.getRepository(PaymentAttemptEntity).findOneByOrFail({ id: attempt.id })
      // queued的检查与prepare启动共用订单锁，消除关单后仍发起网络请求的竞态。
      if (attempt.status === 'queued' && current.status !== 'queued')
        throw new ChannelPendingError('支付启动事实改变，重新查单确认')
      await this.orders.releaseReservations(manager, id)
      await manager.getRepository(RechargeOrderEntity).update(id, { status: 'closed', closedAt: () => 'NOW()' })
      await manager.getRepository(PaymentAttemptEntity).update(current.id, { status: 'cancelled' })
      if (state.currentOrderId === id)
        await manager.getRepository(RechargeUserStateEntity).update(state.id, { currentOrderId: null })
      await this.orders.event(manager, id, 'closed', null, attempt.status === 'queued' ? '任务尚未开始，可安全关闭' : '渠道查单已确认关闭，释放预占一次')
    })
  }

  async ownOrder(userId: string, id: string) {
    positiveInteger(id, 'orderId')
    const row = await this.source.getRepository(RechargeOrderEntity).findOneBy({ id, userId, tenantId: '1' })
    if (!row)
      throw new NotFoundException('订单不存在')
    return row
  }

  private binding(order: RechargeOrderEntity): PaymentBinding {
    if (order.channel === 'wechat')
      return this.wechat.binding(order.client)
    if (order.channel === 'alipay')
      return this.alipay.binding()
    if (order.channel === 'apple')
      return this.apple.binding(order.snapshot.applicationId!, order.snapshot.environment!)
    if (order.channel === 'google') {
      // 下发购买绑定前验证凭据可持久化，避免商店已扣款而服务器没有数据密钥。
      const binding = this.google.binding(order.snapshot.applicationId!, order.snapshot.environment!)
      this.secrets.seal('', `google:${order.snapshot.applicationId}`)
      return binding
    }
    throw new ServiceUnavailableException('内购支付适配尚未启用')
  }

  private provider(order: RechargeOrderEntity) {
    if (order.channel === 'wechat')
      return this.wechat
    if (order.channel === 'alipay')
      return this.alipay
    throw new ServiceUnavailableException('该渠道不支持现金订单查单/关单')
  }

  private assertBinding(stored: PaymentBinding, current: PaymentBinding) {
    if (stored.applicationId !== current.applicationId || stored.merchantId !== current.merchantId || stored.environment !== current.environment)
      throw new ServiceUnavailableException('渠道身份配置已改变，保留原订单并使用原商户配置核查')
  }

  private lockHistoricalUser(manager: import('typeorm').EntityManager, userId: string) {
    return manager.getRepository(SysUserEntity).findOneOrFail({ where: { id: userId, tenantId: '1' }, withDeleted: true, lock: { mode: 'pessimistic_read' } })
  }
}
