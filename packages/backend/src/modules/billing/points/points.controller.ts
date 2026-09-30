import type { PointAction } from './points.types.js'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { TraceContext } from '#/shared/logger/logger.service.js'
import { PointAccountDto, PointGrantDto, PointHoldMutationDto, PointLedgerDto, PointLedgerPageDto, PointLedgerQueryDto, PointMutationDto, PointReverseDto, PointUserIdDto } from './dto/points.dto.js'
import { PointsService } from './points.service.js'
import { POINT_PERMISSIONS } from './points.types.js'

@Controller('points')
@ApiTags('用户积分')
@ApiSecurityAuth()
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get('account')
  @ApiOperation({ summary: '查询本人积分账户，尚无账户时返回0余额' })
  @ApiResult({ type: PointAccountDto })
  account(@CurrentUser() user: LoginUserContext) {
    return this.points.account(user.uid)
  }

  @Get('ledger')
  @ApiOperation({ summary: '游标分页查询本人积分流水' })
  @ApiResult({ type: PointLedgerPageDto })
  ledger(@CurrentUser() user: LoginUserContext, @Query() query: PointLedgerQueryDto) {
    return this.points.ledger(user.uid, query.cursor, query.limit)
  }
}

@Controller('system/points/:userId')
@ApiTags('积分管理')
@ApiSecurityAuth()
export class SystemPointsController {
  constructor(private readonly points: PointsService) {}

  @Get('account')
  @RequirePermissions(POINT_PERMISSIONS.READ)
  @ApiOperation({ summary: '管理端查看指定用户积分' })
  @ApiResult({ type: PointAccountDto })
  account(@Param() params: PointUserIdDto) {
    return this.points.account(params.userId)
  }

  @Get('ledger')
  @RequirePermissions(POINT_PERMISSIONS.READ)
  @ApiOperation({ summary: '管理端查看指定用户积分流水' })
  @ApiResult({ type: PointLedgerPageDto })
  ledger(@Param() params: PointUserIdDto, @Query() query: PointLedgerQueryDto) {
    return this.points.ledger(params.userId, query.cursor, query.limit)
  }

  @Post('grant')
  @HttpCode(200)
  @RequirePermissions(POINT_PERMISSIONS.GRANT)
  @ApiOperation({ summary: '增加积分并记录原因与来源批次' })
  @ApiResult({ type: PointLedgerDto })
  grant(@Param() params: PointUserIdDto, @Body() dto: PointGrantDto, @CurrentUser() user: LoginUserContext) {
    return this.mutate('grant', params, dto, user)
  }

  @Post('debit')
  @HttpCode(200)
  @RequirePermissions(POINT_PERMISSIONS.DEBIT)
  @ApiOperation({ summary: '扣减可用积分，保留流水' })
  @ApiResult({ type: PointLedgerDto })
  debit(@Param() params: PointUserIdDto, @Body() dto: PointMutationDto, @CurrentUser() user: LoginUserContext) {
    return this.mutate('debit', params, dto, user)
  }

  @Post('freeze')
  @HttpCode(200)
  @RequirePermissions(POINT_PERMISSIONS.FREEZE)
  @ApiOperation({ summary: '冻结积分并返回冻结凭证' })
  @ApiResult({ type: PointLedgerDto })
  freeze(@Param() params: PointUserIdDto, @Body() dto: PointMutationDto, @CurrentUser() user: LoginUserContext) {
    return this.mutate('freeze', params, dto, user)
  }

  @Post('capture')
  @HttpCode(200)
  @RequirePermissions(POINT_PERMISSIONS.CAPTURE)
  @ApiOperation({ summary: '核销指定凭证的冻结积分' })
  @ApiResult({ type: PointLedgerDto })
  capture(@Param() params: PointUserIdDto, @Body() dto: PointHoldMutationDto, @CurrentUser() user: LoginUserContext) {
    return this.mutate('capture', params, dto, user)
  }

  @Post('unfreeze')
  @HttpCode(200)
  @RequirePermissions(POINT_PERMISSIONS.UNFREEZE)
  @ApiOperation({ summary: '解冻指定凭证剩余积分' })
  @ApiResult({ type: PointLedgerDto })
  unfreeze(@Param() params: PointUserIdDto, @Body() dto: PointHoldMutationDto, @CurrentUser() user: LoginUserContext) {
    return this.mutate('unfreeze', params, dto, user)
  }

  @Post('reverse')
  @HttpCode(200)
  @RequirePermissions(POINT_PERMISSIONS.REVERSE)
  @ApiOperation({ summary: '完整冲正一笔发放或扣减，保留原流水' })
  @ApiResult({ type: PointLedgerDto })
  reverse(@Param() params: PointUserIdDto, @Body() dto: PointReverseDto, @CurrentUser() user: LoginUserContext) {
    return this.mutate('reverse', params, dto, user)
  }

  private mutate(action: PointAction, params: PointUserIdDto, dto: PointMutationDto & Partial<PointGrantDto & PointHoldMutationDto & PointReverseDto>, user: LoginUserContext) {
    return this.points.execute({
      userId: params.userId,
      actorId: user.uid,
      action,
      amount: dto.amount,
      businessType: `manual_${action}`,
      businessKey: dto.idempotencyKey,
      reason: dto.reason,
      kind: dto.kind,
      holdId: dto.holdId,
      referenceId: dto.referenceId,
      traceId: TraceContext.storage.getStore()?.traceId,
    })
  }
}
