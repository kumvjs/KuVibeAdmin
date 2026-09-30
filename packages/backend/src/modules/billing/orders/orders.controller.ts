import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { BillingIdDto } from '../catalog/dto/catalog.dto.js'
import { OrderCreateDto, OrderListQueryDto, OrderPageDto, OrderResponseDto } from './dto/orders.dto.js'
import { ORDER_PERMISSIONS } from './order.types.js'
import { OrdersService } from './orders.service.js'

@Controller('recharge/orders')
@ApiTags('充值订单')
@ApiSecurityAuth()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: '幂等创建订单并预占额度；不会直接发放积分' })
  @ApiResult({ type: OrderResponseDto })
  create(@CurrentUser() user: LoginUserContext, @Body() dto: OrderCreateDto) {
    return this.orders.create(user.uid, dto)
  }

  @Get()
  @ApiOperation({ summary: '游标查询本人订单' })
  @ApiResult({ type: OrderPageDto })
  list(@CurrentUser() user: LoginUserContext, @Query() query: OrderListQueryDto) {
    return this.orders.list(user.uid, query.cursor, query.limit)
  }

  @Get(':id')
  @ApiOperation({ summary: '查询本人订单详情' })
  @ApiResult({ type: OrderResponseDto })
  get(@CurrentUser() user: LoginUserContext, @Param() params: BillingIdDto) {
    return this.orders.get(user.uid, params.id)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '请求取消本人微信/支付宝订单；发起支付后须等待渠道关单确认' })
  @ApiResult({ type: OrderResponseDto })
  cancel(@CurrentUser() user: LoginUserContext, @Param() params: BillingIdDto) {
    return this.orders.cancel(user.uid, params.id)
  }
}

@Controller('system/billing/orders')
@ApiTags('订单管理')
@ApiSecurityAuth()
export class SystemOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(':id')
  @RequirePermissions(ORDER_PERMISSIONS.READ)
  @ApiOperation({ summary: '管理端查看指定充值订单' })
  @ApiResult({ type: OrderResponseDto })
  get(@Param() params: BillingIdDto) {
    return this.orders.get('', params.id, true)
  }
}
