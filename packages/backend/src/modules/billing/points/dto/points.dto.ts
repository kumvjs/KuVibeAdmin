import type { PointAction, PointKind } from '../points.types.js'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { POINT_ACTIONS } from '../points.types.js'

export class PointUserIdDto {
  @ApiProperty({ type: String, description: '用户bigint ID' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  userId: string
}

export class PointMutationDto {
  @ApiProperty({ type: String, description: '正整数积分，使用十进制字符串' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amount: string

  @ApiProperty({ description: '同一次操作重试必须使用相同键；不同内容不得复用' })
  @IsString()
  @Matches(/^[\w:.-]{1,120}$/)
  idempotencyKey: string

  @ApiProperty({ description: '业务凭证或人工调整原因', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string
}

export class PointGrantDto extends PointMutationDto {
  @ApiPropertyOptional({ enum: ['paid', 'gift'], default: 'gift' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['paid', 'gift'])
  kind?: PointKind
}

export class PointReverseDto extends PointMutationDto {
  @ApiProperty({ type: String, description: '完整冲正的原发放或扣减流水ID' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  referenceId: string
}

export class PointHoldMutationDto extends PointMutationDto {
  @ApiProperty({ type: String, description: '本账户的冻结凭证ID' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  holdId: string
}

export class PointLedgerQueryDto {
  @ApiPropertyOptional({ type: String, description: '上页nextCursor，按流水序号倒序' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  cursor?: string

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20
}

export class PointAccountDto {
  @ApiProperty({ type: String })
  userId: string

  @ApiProperty({ type: String, nullable: true })
  accountId: string | null

  @ApiProperty({ type: String })
  available: string

  @ApiProperty({ type: String })
  frozen: string

  @ApiProperty({ type: String })
  sequence: string

  @ApiProperty({ enum: ['active', 'blocked'] })
  status: string
}

export class PointLedgerDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ type: String })
  sequence: string

  @ApiProperty({ enum: POINT_ACTIONS })
  action: PointAction

  @ApiProperty({ type: String })
  amount: string

  @ApiProperty({ type: String })
  availableDelta: string

  @ApiProperty({ type: String })
  frozenDelta: string

  @ApiProperty({ type: String })
  availableBefore: string

  @ApiProperty({ type: String })
  availableAfter: string

  @ApiProperty({ type: String })
  frozenBefore: string

  @ApiProperty({ type: String })
  frozenAfter: string

  @ApiProperty()
  businessType: string

  @ApiProperty()
  businessKey: string

  @ApiProperty()
  reason: string

  @ApiProperty({ type: String, nullable: true })
  actorId: string | null

  @ApiProperty({ type: String, nullable: true })
  referenceId: string | null

  @ApiProperty({ type: String, nullable: true, description: '冻结时返回新凭证；核销/解冻返回原凭证' })
  holdId: string | null

  @ApiProperty({ format: 'date-time' })
  createdAt: string
}

export class PointLedgerPageDto {
  @ApiProperty({ type: [PointLedgerDto] })
  items: PointLedgerDto[]

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null
}
