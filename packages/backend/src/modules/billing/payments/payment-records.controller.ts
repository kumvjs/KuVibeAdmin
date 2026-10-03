import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { BillingIdDto } from '../catalog/dto/catalog.dto.js'
import { AppleRestoreDto, GoogleRestoreDto, PaymentBindDto, PaymentRecordDto, PaymentRecordPageDto, PaymentRecordQueryDto, PaymentRecoveryDto, PaymentReviewDto } from './dto/payment-records.dto.js'
import { ReceiptAcceptedDto } from './dto/payments.dto.js'
import { PAYMENT_PERMISSIONS } from './payment.types.js'

import { PaymentsService } from './payments.service.js'

@Controller('recharge/payments')
@ApiTags('内购交易恢复')
@ApiSecurityAuth()
export class StorePurchaseRestoreController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('apple-receipt')
  @HttpCode(200)
  @ApiOperation({ summary: '补报Apple历史交易，独立验真并记录平台流水；无归属时不创建订单、不发分' })
  @ApiResult({ type: ReceiptAcceptedDto })
  apple(@Body() dto: AppleRestoreDto, @CurrentUser() user: LoginUserContext) {
    return this.payments.restore(user.uid, 'apple', dto)
  }

  @Post('google-receipt')
  @HttpCode(200)
  @ApiOperation({ summary: '补报Google购买，独立验真并记录平台流水；登录态不替代购买归属' })
  @ApiResult({ type: ReceiptAcceptedDto })
  google(@Body() dto: GoogleRestoreDto, @CurrentUser() user: LoginUserContext) {
    return this.payments.restore(user.uid, 'google', dto)
  }
}

@Controller('system/billing/payments')
@ApiTags('平台支付流水')
@ApiSecurityAuth()
export class PaymentRecordsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(PAYMENT_PERMISSIONS.READ)
  @ApiOperation({ summary: '查询验真平台流水及异常支付；不返回原始收据或购买token' })
  @ApiResult({ type: PaymentRecordPageDto })
  list(@Query() dto: PaymentRecordQueryDto) {
    return this.payments.transactions(dto)
  }

  @Post(':id/recheck')
  @HttpCode(200)
  @RequirePermissions(PAYMENT_PERMISSIONS.RECHECK)
  @ApiOperation({ summary: '审计申请平台交易重新验真和恢复匹配，不猜套餐、不直接发分' })
  @ApiResult({ type: PaymentRecoveryDto })
  recheck(@Param() params: BillingIdDto, @Body() dto: PaymentReviewDto, @CurrentUser() user: LoginUserContext) {
    return this.payments.requestRecovery(params.id, user.uid, dto.reason)
  }

  @Post(':id/bind')
  @HttpCode(200)
  @RequirePermissions(PAYMENT_PERMISSIONS.BIND)
  @ApiOperation({ summary: '人工核实无绑定交易并关联有效订单；矛盾绑定/迟到旧单不能绕过，另行验真后才履约' })
  @ApiResult({ type: PaymentRecordDto })
  bind(@Param() params: BillingIdDto, @Body() dto: PaymentBindDto, @CurrentUser() user: LoginUserContext) {
    return this.payments.bindTransaction(params.id, dto.orderId, user.uid, dto.reason)
  }
}
