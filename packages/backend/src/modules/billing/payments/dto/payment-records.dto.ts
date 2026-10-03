import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator'
import { PointLedgerQueryDto } from '../../points/dto/points.dto.js'
import { GoogleReceiptDto } from './payments.dto.js'

export class AppleRestoreDto {
  @ApiProperty({ description: '已配置的iOS Bundle ID' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  applicationId: string

  @ApiProperty({ enum: ['sandbox', 'production'] })
  @IsIn(['sandbox', 'production'])
  environment: 'sandbox' | 'production'

  @ApiPropertyOptional({ description: '原交易ID；与transactionReceipt至少提供一个，优先使用交易ID' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,64}$/)
  transactionId?: string

  @ApiPropertyOptional({ description: '旧App receipt，仅用于提取交易ID，服务端另查交易并验签，不保存原收据' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(65536)
  @Matches(/^[A-Z0-9+/=]+$/i)
  transactionReceipt?: string
}

export class GoogleRestoreDto extends GoogleReceiptDto {
  @ApiProperty({ description: '已配置的Android Package Name' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  applicationId: string

  @ApiProperty({ enum: ['sandbox', 'production'] })
  @IsIn(['sandbox', 'production'])
  environment: 'sandbox' | 'production'
}

export class PaymentRecordQueryDto extends PointLedgerQueryDto {
  @ApiPropertyOptional({ enum: ['apple', 'google', 'wechat', 'alipay'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['apple', 'google', 'wechat', 'alipay'])
  channel?: string

  @ApiPropertyOptional({ enum: ['unmatched', 'matched', 'fulfilled', 'review'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['unmatched', 'matched', 'fulfilled', 'review'])
  status?: string

  @ApiPropertyOptional({ description: '精确交易键：Apple环境/应用/交易ID组合；Google token SHA256摘要' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  transactionKey?: string
}

export class PaymentReviewDto {
  @ApiProperty({ description: '核查或人工确认归属依据，写入审计' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string
}

export class PaymentBindDto extends PaymentReviewDto {
  @ApiProperty({ description: '核实归属的有效业务订单，不能关联已释放名额的旧订单' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  orderId: string
}

export class ManualPaymentBindingDto {
  @ApiProperty({ type: String }) orderId: string
  @ApiProperty({ type: String }) actorId: string
  @ApiProperty() reason: string
}

export class PlatformAmountDto {
  @ApiProperty({ type: String, description: '精确整数，金额=value/10^scale，不经浮点换算' }) value: string
  @ApiProperty({ enum: [3, 9], description: 'Apple milliunits为3；Google Money为9' }) scale: number
  @ApiProperty({ description: '平台返回的ISO 4217货币代码' }) currency: string
  @ApiProperty({ enum: ['apple_transaction', 'google_order'] }) source: string
}

export class PaymentRecordDto {
  @ApiProperty({ type: String }) id: string
  @ApiProperty({ type: String, nullable: true }) orderId: string | null
  @ApiProperty({ enum: ['apple', 'google', 'wechat', 'alipay'] }) channel: string
  @ApiProperty() transactionKey: string
  @ApiProperty({ type: String, nullable: true }) productId: string | null
  @ApiProperty() applicationId: string
  @ApiProperty({ enum: ['sandbox', 'production'] }) environment: string
  @ApiProperty({ enum: ['pending', 'paid', 'closed', 'refunded'] }) platformState: string
  @ApiProperty({ type: String, nullable: true, description: '微信/支付宝平台确认的CNY分；内购为null，使用platformAmount；不以站内套餐标价填充' }) amountMinor: string | null
  @ApiProperty({ type: String, nullable: true }) currency: string | null
  @ApiProperty({ type: PlatformAmountDto, nullable: true, description: '已验真商店原始精度金额；未知为null' }) platformAmount: PlatformAmountDto | null
  @ApiProperty({ type: String, nullable: true, description: '平台订单号仅供查询对账，不作为Google交易去重标识' }) platformOrderId: string | null
  @ApiProperty({ type: String }) quantity: string
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paidAt: string | null
  @ApiProperty({ enum: ['unmatched', 'matched', 'fulfilled', 'review'] }) status: string
  @ApiProperty({ type: String, nullable: true }) reason: string | null
  @ApiProperty({ format: 'date-time' }) createdAt: string
  @ApiProperty({ format: 'date-time' }) verifiedAt: string
  @ApiProperty({ type: ManualPaymentBindingDto, nullable: true }) manualBinding: ManualPaymentBindingDto | null
}

export class PaymentRecordPageDto {
  @ApiProperty({ type: [PaymentRecordDto] }) items: PaymentRecordDto[]
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null
}

export class PaymentRecoveryDto {
  @ApiProperty({ type: String }) id: string
  @ApiProperty({ enum: ['queued'] }) status: string
}
