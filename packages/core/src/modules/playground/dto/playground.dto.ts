import type { PlaygroundTableSortField } from '../playground.constants.js'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { PLAYGROUND_TABLE_SORT_FIELDS } from '../playground.constants.js'

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null || value === '' ? undefined : Number(value)
}

export class PlaygroundTableQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => optionalNumber(value) ?? 1)
  @IsInt()
  @Min(1)
  page: number = 1

  @ApiPropertyOptional({ default: 10, maximum: 100, minimum: 1 })
  @Transform(({ value }) => optionalNumber(value) ?? 10)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10

  @ApiPropertyOptional({ enum: PLAYGROUND_TABLE_SORT_FIELDS })
  @IsOptional()
  @IsIn(PLAYGROUND_TABLE_SORT_FIELDS)
  sortBy?: PlaygroundTableSortField

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'
}

export class PlaygroundStatusQueryDto {
  @ApiPropertyOptional({ default: 200, description: '要模拟的 HTTP 状态码', maximum: 599, minimum: 200 })
  @Transform(({ value }) => optionalNumber(value) ?? 200)
  @IsInt()
  @Min(200)
  @Max(599)
  status: number = 200
}

export class PlaygroundTableItemDto {
  @ApiProperty()
  available: boolean

  @ApiProperty()
  category: string

  @ApiProperty()
  color: string

  @ApiProperty()
  currency: string

  @ApiProperty()
  description: string

  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty()
  imageUrl: string

  @ApiProperty()
  imageUrl2: string

  @ApiProperty()
  inProduction: boolean

  @ApiProperty()
  open: boolean

  @ApiProperty({ description: '与 Vben mock 的 faker commerce.price 返回类型一致' })
  price: string

  @ApiProperty()
  productName: string

  @ApiProperty()
  quantity: number

  @ApiProperty()
  rating: number

  @ApiProperty({ format: 'date-time' })
  releaseDate: string

  @ApiProperty({ enum: ['error', 'success', 'warning'] })
  status: 'error' | 'success' | 'warning'

  @ApiProperty({ type: [String] })
  tags: string[]

  @ApiProperty()
  weight: number
}

export class PlaygroundTableResponseDto {
  @ApiProperty({ type: [PlaygroundTableItemDto] })
  items: PlaygroundTableItemDto[]

  @ApiProperty()
  total: number
}

export class UploadResponseDto {
  @ApiProperty({ description: '临时公开图片 URL' })
  url: string
}
