import type { ConsecutiveGrantMode, Eligibility, PaymentChannel, PromotionEffect } from '../catalog.types.js'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { MAX_CONSECUTIVE_DAYS, PAYMENT_CHANNELS, PROMOTION_EFFECTS } from '../catalog.types.js'

export class BillingIdDto {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  id: string
}

export class PackageVersionWriteDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string

  @ApiProperty({ type: String, description: '微信/支付宝CNY分，不作为内购商店扣款参数' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  priceMinor: string

  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  basePoints: string

  @ApiPropertyOptional({ type: String, default: '0' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  giftPoints = '0'

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  startsAt?: string | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  endsAt?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, description: '总限量；null不限、0不可买。仅微信/支付宝' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  totalLimit?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  dailyLimit?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  userTotalLimit?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  userDailyLimit?: string | null
}

export class PackageCreateDto extends PackageVersionWriteDto {
  @ApiProperty({ description: '稳定套餐标识' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{0,49}$/)
  code: string
}

export class PublishStatusDto {
  @ApiProperty({ enum: ['enabled', 'disabled'] })
  @IsIn(['enabled', 'disabled'])
  status: 'enabled' | 'disabled'
}

export class PromotionVersionWriteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string

  @ApiProperty({ enum: PROMOTION_EFFECTS })
  @IsIn(PROMOTION_EFFECTS)
  effect: PromotionEffect

  @ApiPropertyOptional({ type: String, description: '减免分数/赠分数量或basis points比例；连续赠送使用dailyBonusPoints' })
  @ValidateIf((object, value) => object.effect !== 'bonus_consecutive' || value !== undefined)
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  value?: string

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_CONSECUTIVE_DAYS, description: '连续赠送必填，超过最大天数持续按最后一天额度赠送' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_CONSECUTIVE_DAYS)
  maxConsecutiveDays?: number

  @ApiPropertyOptional({ type: [String], description: '第1到最大天数的赠送积分，每天可为0，不减免实付金额' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CONSECUTIVE_DAYS)
  @Matches(/^(?:0|[1-9]\d{0,18})$/, { each: true })
  dailyBonusPoints?: string[]

  @ApiPropertyOptional({ enum: ['daily_first', 'every_order'], default: 'daily_first', description: '每天本套餐首笔成功充值赠送，或每笔成功充值赠送；同日不增加连续天数' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['daily_first', 'every_order'])
  consecutiveGrantMode?: ConsecutiveGrantMode

  @ApiPropertyOptional({ enum: ['always', 'first_user', 'first_day'], default: 'always' })
  @IsIn(['always', 'first_user', 'first_day'])
  eligibility: Eligibility = 'always'

  @ApiProperty({ enum: PAYMENT_CHANNELS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(PAYMENT_CHANNELS, { each: true })
  channels: PaymentChannel[]

  @ApiPropertyOptional({ type: [String], description: '空数组适用所有套餐' })
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(/^[1-9]\d{0,18}$/, { each: true })
  packageIds: string[] = []

  @ApiPropertyOptional({ type: String, default: '0', description: '原标价门槛；内购赠分首期设0' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  minimumMinor = '0'

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  requiresCoupon = false

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(-100000)
  @Max(100000)
  priority = 0

  @ApiProperty({ format: 'date-time' })
  @IsString()
  startsAt: string

  @ApiProperty({ format: 'date-time' })
  @IsString()
  endsAt: string

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  totalUses?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  userTotalUses?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  userDailyUses?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  cashBudget?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  pointsBudget?: string | null
}

export class PromotionCreateDto extends PromotionVersionWriteDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{0,49}$/)
  code: string
}

export class CouponCreateDto {
  @ApiProperty({ description: '仅保存摘要；券码由运营自行安全分发' })
  @IsString()
  @Matches(/^[\w-]{6,64}$/)
  code: string

  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  promotionId: string

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null为公共券码' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^[1-9]\d{0,18}$/)
  userId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?:0|[1-9]\d{0,18})$/)
  totalLimit?: string | null

  @ApiProperty({ format: 'date-time' })
  @IsString()
  startsAt: string

  @ApiProperty({ format: 'date-time' })
  @IsString()
  endsAt: string
}

export class ChannelProductWriteDto {
  @ApiProperty({ type: String })
  @Matches(/^[1-9]\d{0,18}$/)
  versionId: string

  @ApiProperty({ enum: ['apple', 'google'] })
  @IsIn(['apple', 'google'])
  channel: 'apple' | 'google'

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  applicationId: string

  @ApiProperty({ enum: ['sandbox', 'production'] })
  @IsIn(['sandbox', 'production'])
  environment: 'sandbox' | 'production'

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  productId: string
}

export class QuoteQueryDto {
  @ApiProperty({ enum: PAYMENT_CHANNELS })
  @IsIn(PAYMENT_CHANNELS)
  channel: PaymentChannel

  @ApiPropertyOptional({ type: String, description: '内购必须提供公开列表中的渠道映射ID' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[1-9]\d{0,18}$/)
  channelProductId?: string

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[\w-]{6,64}$/)
  couponCode?: string
}

export class CatalogListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20
}

export class PackageResponseDto extends PackageVersionWriteDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty()
  code: string

  @ApiProperty()
  status: string

  @ApiProperty({ type: String })
  versionId: string

  @ApiProperty()
  revision: number
}

export class PackagePageDto {
  @ApiProperty({ type: [PackageResponseDto] })
  items: PackageResponseDto[]

  @ApiProperty()
  total: number
}

export class PromotionResponseDto extends PromotionVersionWriteDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ type: String })
  versionId: string

  @ApiProperty()
  revision: number

  @ApiProperty()
  code: string

  @ApiProperty()
  status: string
}

export class PromotionPageDto {
  @ApiProperty({ type: [PromotionResponseDto] })
  items: PromotionResponseDto[]

  @ApiProperty()
  total: number
}

export class QuoteResponseDto {
  @ApiProperty({ description: '本次成功充值预计达到的同套餐连续天数，结算重新计算' })
  consecutiveRechargeDays: number

  @ApiProperty({ description: '本套餐今日是否尚无成功充值，按Asia/Shanghai' })
  firstPackageRechargeToday: boolean

  @ApiProperty({ type: String })
  packageId: string

  @ApiProperty({ type: String })
  versionId: string

  @ApiProperty()
  revision: number

  @ApiProperty({ enum: PAYMENT_CHANNELS })
  channel: PaymentChannel

  @ApiProperty({ type: String, nullable: true, description: '内购为null，价格由商店展示和扣款' })
  payableMinor: string | null

  @ApiProperty({ type: String, nullable: true })
  currency: string | null

  @ApiProperty({ type: String })
  basePoints: string

  @ApiProperty({ type: String })
  packageGiftPoints: string

  @ApiProperty({ type: String })
  guaranteedBonusPoints: string

  @ApiProperty({ type: String, description: '包括首单等结算条件的预计活动赠分；不与保底赠分相加' })
  estimatedBonusPoints: string

  @ApiProperty({ description: '首单按验真入账判定，报价不锁资格或库存' })
  notice: string

  @ApiProperty({ type: String, nullable: true })
  channelProductId: string | null

  @ApiProperty({ type: String, nullable: true })
  productId: string | null

  @ApiProperty({ type: String, nullable: true })
  cashPromotionId: string | null

  @ApiProperty({ type: String, nullable: true })
  bonusPromotionId: string | null
}

export class ChannelProductResponseDto extends ChannelProductWriteDto {
  @ApiProperty({ type: String })
  id: string
}

export class CouponResponseDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ type: String })
  promotionId: string

  @ApiProperty({ type: String })
  versionId: string

  @ApiProperty({ type: String, nullable: true })
  userId: string | null

  @ApiProperty({ type: String, nullable: true })
  totalLimit: string | null

  @ApiProperty({ format: 'date-time' })
  startsAt: string

  @ApiProperty({ format: 'date-time' })
  endsAt: string
}
