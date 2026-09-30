import type { PaymentChannel } from '../../catalog/catalog.types.js'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsString, Matches, ValidateIf } from 'class-validator'
import { PAYMENT_CHANNELS } from '../../catalog/catalog.types.js'
import { PointLedgerQueryDto } from '../../points/dto/points.dto.js'

export class OrderCreateDto {
  @ApiProperty({ type: String })
  @Matches(/^[1-9]\d{0,18}$/)
  packageId: string

  @ApiProperty({ type: String, description: '用户确认的不可变套餐版本，改版返回409须重新报价' })
  @Matches(/^[1-9]\d{0,18}$/)
  versionId: string

  @ApiProperty({ enum: PAYMENT_CHANNELS })
  @IsIn(PAYMENT_CHANNELS)
  channel: PaymentChannel

  @ApiProperty({ enum: ['app', 'qr'] })
  @IsIn(['app', 'qr'])
  client: 'app' | 'qr'

  @ApiProperty({ description: '每次业务意图生成一个键；网络失败使用原键重试' })
  @IsString()
  @Matches(/^[\w:.-]{1,120}$/)
  idempotencyKey: string

  @ApiPropertyOptional({ type: String, description: '微信/支付宝必填确认的CNY分；内购禁止提交' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[1-9]\d{0,18}$/)
  payableMinor?: string

  @ApiPropertyOptional({ type: String, description: '内购必填映射ID' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[1-9]\d{0,18}$/)
  channelProductId?: string

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[\w-]{6,64}$/)
  couponCode?: string
}

export class OrderListQueryDto extends PointLedgerQueryDto {}

export class SystemOrderListQueryDto extends OrderListQueryDto {
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[1-9]\d{0,18}$/)
  userId?: string

  @ApiPropertyOptional({ enum: ['pending', 'closing', 'closed', 'paid', 'refund_pending', 'refunded', 'review'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['pending', 'closing', 'closed', 'paid', 'refund_pending', 'refunded', 'review'])
  status?: string

  @ApiPropertyOptional({ enum: PAYMENT_CHANNELS })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(PAYMENT_CHANNELS)
  channel?: PaymentChannel

  @ApiPropertyOptional({ description: '精确查询商户订单号' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-f0-9]{32}$/)
  merchantNo?: string
}

export class OrderSettlementDto {
  @ApiProperty({ type: String }) paidLedgerId: string
  @ApiProperty({ type: String, nullable: true }) giftLedgerId: string | null
  @ApiProperty({ description: '原实际发放基础积分，退款后仍保留历史值' }) basePoints: string
  @ApiProperty({ description: '原实际发放赠分合计，已包含活动赠分' }) giftPoints: string
  @ApiProperty({ description: '已包含在giftPoints中的实际活动赠分，不能再次相加' }) bonusPoints: string
}

export class OrderResponseDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty()
  merchantNo: string

  @ApiProperty({ type: String })
  userId: string

  @ApiProperty({ type: String })
  packageId: string

  @ApiProperty({ type: String })
  versionId: string

  @ApiProperty({ enum: PAYMENT_CHANNELS })
  channel: PaymentChannel

  @ApiProperty({ enum: ['app', 'qr'] })
  client: string

  @ApiProperty({ enum: ['pending', 'closing', 'closed', 'paid', 'refund_pending', 'refunded', 'review'] })
  status: string

  @ApiProperty({ type: String, nullable: true })
  payableMinor: string | null

  @ApiProperty({ type: String, nullable: true })
  currency: string | null

  @ApiProperty()
  title: string

  @ApiProperty({ type: String })
  basePoints: string

  @ApiProperty({ type: String })
  giftPoints: string

  @ApiProperty({ type: String })
  guaranteedBonusPoints: string

  @ApiProperty({ type: OrderSettlementDto, nullable: true, description: '已入账不可变权益及流水；尚未入账为null' })
  settlement: OrderSettlementDto | null

  @ApiProperty({ type: String, nullable: true })
  productId: string | null

  @ApiProperty({ type: String, nullable: true })
  channelProductId: string | null

  @ApiProperty({ format: 'date-time' })
  createdAt: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  settledAt: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: string | null
}

export class OrderPageDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items: OrderResponseDto[]

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null
}
