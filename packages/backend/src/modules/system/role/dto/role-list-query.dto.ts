import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { RoleStatus } from '../role.types.js'

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null || value === '' ? undefined : Number(value)
}

export class RoleListQueryDto {
  @ApiPropertyOptional({ description: '结束创建时间（ISO 8601）' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endTime?: string

  @ApiPropertyOptional({ description: '精确角色 ID', type: String })
  @IsOptional()
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/, { message: 'id 必须是正整数 bigint 字符串' })
  id?: string

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => optionalNumber(value) ?? 1)
  @IsInt()
  @Min(1)
  page: number = 1

  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1 })
  @Transform(({ value }) => optionalNumber(value) ?? 20)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string

  @ApiPropertyOptional({ description: '开始创建时间（ISO 8601）' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startTime?: string

  @ApiPropertyOptional({ enum: RoleStatus })
  @Transform(({ value }) => optionalNumber(value))
  @IsOptional()
  @IsIn([RoleStatus.DISABLED, RoleStatus.ENABLED])
  status?: RoleStatus
}
