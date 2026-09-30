import type { RawBodyRequest } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Body, Controller, Header, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { SkipResponseTransform } from '#/common/decorators/skip-response-transform.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { BillingIdDto } from '../catalog/dto/catalog.dto.js'
import { AlipayProvider } from './alipay.provider.js'
import { AppleNotificationDto, AppleReceiptDto, GoogleReceiptDto, PaymentPrepareDto, ReceiptAcceptedDto } from './dto/payments.dto.js'
import { PaymentsService } from './payments.service.js'
import { WechatProvider } from './wechat.provider.js'

@Controller('recharge/orders')
@ApiTags('充值支付')
@ApiSecurityAuth()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/payment')
  @HttpCode(200)
  @ApiOperation({ summary: '创建或查询本人订单支付准备任务；ready后再调用客户端支付SDK' })
  @ApiResult({ type: PaymentPrepareDto })
  prepare(@CurrentUser() user: LoginUserContext, @Param() params: BillingIdDto) {
    return this.payments.prepare(user.uid, params.id)
  }

  @Post(':id/apple-receipt')
  @HttpCode(200)
  @ApiOperation({ summary: '提交Apple消耗型交易查验任务；必须订单paid后才让StoreKit finish' })
  @ApiResult({ type: ReceiptAcceptedDto })
  apple(@CurrentUser() user: LoginUserContext, @Param() params: BillingIdDto, @Body() dto: AppleReceiptDto) {
    return this.payments.receipt(user.uid, params.id, dto)
  }

  @Post(':id/google-receipt')
  @HttpCode(200)
  @ApiOperation({ summary: '持久化Google消耗型token验真任务；服务端入账后消费确认' })
  @ApiResult({ type: ReceiptAcceptedDto })
  google(@CurrentUser() user: LoginUserContext, @Param() params: BillingIdDto, @Body() dto: GoogleReceiptDto) {
    return this.payments.receipt(user.uid, params.id, dto)
  }
}

@Controller('payments')
export class PaymentNotificationsController {
  constructor(private readonly payments: PaymentsService, private readonly wechat: WechatProvider, private readonly alipay: AlipayProvider) {}

  @Post('wechat/notify')
  @Public()
  @SkipResponseTransform()
  @HttpCode(204)
  @ApiExcludeEndpoint()
  async wechatNotify(@Req() request: RawBodyRequest<FastifyRequest>) {
    await this.payments.acceptCash(this.wechat.notification(this.raw(request), request.headers))
  }

  @Post('wechat/refund-notify')
  @Public()
  @SkipResponseTransform()
  @HttpCode(204)
  @ApiExcludeEndpoint()
  async wechatRefundNotify(@Req() request: RawBodyRequest<FastifyRequest>) {
    await this.payments.acceptWechatRefund(this.wechat.refundNotification(this.raw(request), request.headers))
  }

  @Post('alipay/notify')
  @Public()
  @SkipResponseTransform()
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiExcludeEndpoint()
  async alipayNotify(@Req() request: RawBodyRequest<FastifyRequest>) {
    await this.payments.acceptCash(this.alipay.notification(this.raw(request)))
    return 'success'
  }

  @Post('apple/notify')
  @Public()
  @SkipResponseTransform()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async appleNotify(@Body() body: AppleNotificationDto) {
    await this.payments.acceptApple(body.signedPayload)
  }

  @Post('google/notify')
  @Public()
  @SkipResponseTransform()
  @HttpCode(204)
  @ApiExcludeEndpoint()
  async googleNotify(@Req() request: RawBodyRequest<FastifyRequest>) {
    this.raw(request)
    await this.payments.acceptGoogle(request.body, request.headers.authorization)
  }

  private raw(request: RawBodyRequest<FastifyRequest>) {
    if (!Buffer.isBuffer(request.rawBody) || request.rawBody.length > 131072)
      throw new UnauthorizedException('支付通知必须包含大小受限的原始请求体')
    return request.rawBody
  }
}
