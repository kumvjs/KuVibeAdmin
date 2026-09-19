import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'

export enum Order {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class PageQueryDto<T = any> {
  @ApiProperty({ minimum: 1, default: 1 })
  @Min(1)
  @IsInt()
  @Expose()
  @IsOptional({ always: true })
  @Transform(({ value: val }) => (val ? Number.parseInt(val) : 1), {
    toClassOnly: true,
  })
  page?: number

  @ApiProperty({ minimum: 1, maximum: 100, default: 10 })
  @Min(1)
  @Max(100)
  @IsInt()
  @IsOptional({ always: true })
  @Expose()
  @Transform(({ value: val }) => Math.min((val ? Number.parseInt(val) : 10), 100), {
    toClassOnly: true,
  })
  pageSize?: number

  @ApiProperty({ enum: Order })
  @IsEnum(Order)
  @IsOptional()
  @Transform(({ value }) => (value === 'asc' ? Order.ASC : Order.DESC))
  order?: Order
}
