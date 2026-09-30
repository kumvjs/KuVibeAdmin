import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class RefundRequestDto {
  @ApiProperty({ description: '同一退款申请重试须保持不变', maxLength: 120 })
  @IsString()
  @Matches(/^[\w:.-]{1,120}$/)
  idempotencyKey: string

  @ApiProperty({ description: '退款/对账人工依据', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string
}

export class ReconcileRequestDto extends RefundRequestDto {
  @ApiPropertyOptional({ description: '默认验真渠道；false仅执行站内账务核对并明确标记渠道未检查', default: true })
  @IsOptional()
  @IsBoolean()
  verifyChannel?: boolean
}

export class RiskResolveDto {
  @ApiProperty({ description: '人工处置/缺口核销依据；不会生成虚假退款或积分流水', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string
}

export class RefundResponseDto {
  @ApiProperty() id: string
  @ApiProperty() orderId: string
  @ApiProperty() refundNo: string
  @ApiProperty({ enum: ['wechat', 'alipay', 'apple', 'google'] }) channel: string
  @ApiProperty({ enum: ['manual', 'external'] }) kind: string
  @ApiProperty({ enum: ['held', 'processing', 'succeeded', 'failed', 'review'] }) status: string
  @ApiProperty({ type: String, nullable: true }) amountMinor: string | null
  @ApiProperty() sourcePoints: string
  @ApiProperty() recoveredPoints: string
  @ApiProperty() gapPoints: string
  @ApiProperty({ type: String, nullable: true }) holdId: string | null
  @ApiProperty({ type: String, nullable: true }) actorId: string | null
  @ApiProperty() reason: string
  @ApiProperty() createdAt: string
}

export class FindingDto {
  @ApiProperty() code: string
  @ApiPropertyOptional() expected?: string
  @ApiPropertyOptional() actual?: string
}

export class ReconcileResponseDto {
  @ApiProperty() id: string
  @ApiProperty() orderId: string
  @ApiProperty() actorId: string
  @ApiProperty() reason: string
  @ApiProperty() verifyChannel: boolean
  @ApiProperty({ enum: ['pending', 'done', 'review'] }) status: string
  @ApiProperty({ type: [FindingDto], nullable: true }) findings: FindingDto[] | null
  @ApiProperty({ type: String, nullable: true }) completedAt: string | null
  @ApiProperty() createdAt: string
}

export class RiskResponseDto {
  @ApiProperty() id: string
  @ApiProperty() userId: string
  @ApiProperty() orderId: string
  @ApiProperty() type: string
  @ApiProperty() gapPoints: string
  @ApiProperty({ enum: ['open', 'resolved'] }) status: string
  @ApiProperty({ type: String, nullable: true }) resolvedBy: string | null
  @ApiProperty({ type: String, nullable: true }) resolutionReason: string | null
  @ApiProperty({ type: String, nullable: true }) resolvedAt: string | null
  @ApiProperty() createdAt: string
}
