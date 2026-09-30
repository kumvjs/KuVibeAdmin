import type { RawBodyRequest } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Controller, Header, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { SkipResponseTransform } from '#/common/decorators/skip-response-transform.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { BillingIdDto } from '../catalog/dto/catalog.dto.js'
import { AlipayProvider } from './alipay.provider.js'
import { PaymentPrepareDto } from './dto/payments.dto.js'
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

  private raw(request: RawBodyRequest<FastifyRequest>) {
    if (!Buffer.isBuffer(request.rawBody) || request.rawBody.length > 131072)
      throw new UnauthorizedException('支付通知必须包含大小受限的原始请求体')
    return request.rawBody
  }
}
