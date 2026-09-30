import type { BillingRiskEntity } from './entities/billing-risk.entity.js'
import type { RechargeRefundEntity } from './entities/recharge-refund.entity.js'
import type { ReconciliationEntity } from './entities/reconciliation.entity.js'
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { BillingIdDto } from '../catalog/dto/catalog.dto.js'
import { ORDER_PERMISSIONS } from '../orders/order.types.js'
import { ReconciliationService } from './reconciliation.service.js'
import { ReconcileRequestDto, ReconcileResponseDto, RefundRequestDto, RefundResponseDto, RiskResolveDto, RiskResponseDto } from './refunds.dto.js'
import { RefundsService } from './refunds.service.js'

export const RISK_RESOLVE_PERMISSION = 'system:billing:risk:resolve'

const refundResult = (row: RechargeRefundEntity): RefundResponseDto => ({ id: row.id, orderId: row.orderId, refundNo: row.refundNo, channel: row.channel, kind: row.kind, status: row.status, amountMinor: row.amountMinor, sourcePoints: row.sourcePoints, recoveredPoints: row.recoveredPoints, gapPoints: row.gapPoints, holdId: row.holdId, actorId: row.actorId, reason: row.reason, createdAt: row.createdAt.toISOString() })
const reconcileResult = (row: ReconciliationEntity): ReconcileResponseDto => ({ id: row.id, orderId: row.orderId, actorId: row.actorId, reason: row.reason, verifyChannel: row.verifyChannel, status: row.status, findings: row.findings, completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })
const riskResult = (row: BillingRiskEntity): RiskResponseDto => ({ id: row.id, orderId: row.orderId, userId: row.userId, type: row.type, gapPoints: row.gapPoints, status: row.status, resolvedBy: row.resolvedBy, resolutionReason: row.resolutionReason, resolvedAt: row.resolvedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })

@Controller('system/billing/orders')
@ApiTags('充值退款与对账')
@ApiSecurityAuth()
export class RefundsController {
  constructor(private readonly refunds: RefundsService, private readonly reconcile: ReconciliationService) {}

  @Post(':id/refund')
  @HttpCode(200)
  @RequirePermissions(ORDER_PERMISSIONS.REFUND)
  @ApiOperation({ summary: '幂等申请微信/支付宝全额退款，冻结原订单未使用权益' })
  @ApiResult({ type: RefundResponseDto })
  async request(@Param() params: BillingIdDto, @Body() dto: RefundRequestDto, @CurrentUser() user: LoginUserContext) {
    return refundResult(await this.refunds.request(params.id, dto, user.uid))
  }

  @Get(':id/refunds')
  @RequirePermissions(ORDER_PERMISSIONS.READ)
  @ApiOperation({ summary: '查询指定订单退款审计记录' })
  @ApiResult({ type: [RefundResponseDto] })
  async list(@Param() params: BillingIdDto) {
    return (await this.refunds.list(params.id)).map(refundResult)
  }

  @Post(':id/reconcile')
  @HttpCode(200)
  @RequirePermissions(ORDER_PERMISSIONS.RECONCILE)
  @ApiOperation({ summary: '幂等创建对账任务并恢复本订单死信，保留有效worker租约' })
  @ApiResult({ type: ReconcileResponseDto })
  async requestReconcile(@Param() params: BillingIdDto, @Body() dto: ReconcileRequestDto, @CurrentUser() user: LoginUserContext) {
    return reconcileResult(await this.reconcile.request(params.id, dto, user.uid))
  }

  @Get(':id/reconciliations')
  @RequirePermissions(ORDER_PERMISSIONS.READ)
  @ApiOperation({ summary: '查询对账差异及渠道是否已检查' })
  @ApiResult({ type: [ReconcileResponseDto] })
  async reconciliations(@Param() params: BillingIdDto) {
    return (await this.reconcile.list(params.id)).map(reconcileResult)
  }
}

@Controller('system/billing/risks')
@ApiTags('积分风险处置')
@ApiSecurityAuth()
export class BillingRisksController {
  constructor(private readonly refunds: RefundsService) {}

  @Get('user/:id')
  @RequirePermissions(ORDER_PERMISSIONS.READ)
  @ApiOperation({ summary: '查询用户退款缺口与账务风险，最多100条' })
  @ApiResult({ type: [RiskResponseDto] })
  async list(@Param() params: BillingIdDto) {
    return (await this.refunds.risks(params.id)).map(riskResult)
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(RISK_RESOLVE_PERMISSION)
  @ApiOperation({ summary: '审计人工风险处置；全部风险解决后恢复消费权限' })
  @ApiResult({ type: RiskResponseDto })
  async resolve(@Param() params: BillingIdDto, @Body() dto: RiskResolveDto, @CurrentUser() user: LoginUserContext) {
    return riskResult(await this.refunds.resolveRisk(params.id, dto.reason, user.uid))
  }
}
