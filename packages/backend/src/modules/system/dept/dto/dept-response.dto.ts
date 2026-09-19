import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { DeptStatus } from '../dept.types.js'

export class DeptResponseDto {
  @ApiPropertyOptional({ type: () => [DeptResponseDto] })
  children?: DeptResponseDto[]

  @ApiProperty({ description: '创建时间', type: Date })
  createTime: Date

  @ApiProperty({ type: String })
  id: string

  @ApiProperty()
  name: string

  @ApiProperty({ description: '同级排序' })
  order: number

  @ApiPropertyOptional({ type: String })
  pid?: string

  @ApiPropertyOptional()
  remark?: string

  @ApiProperty({ enum: DeptStatus })
  status: DeptStatus
}
