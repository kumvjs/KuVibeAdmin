import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DeptStatus } from '../dept.types.js'

export class CreateDeptDto {
  @ApiProperty({ maxLength: 20, minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^\S(?:.*\S)?$/u, { message: 'name 首尾不得包含空白字符' })
  name: string

  @ApiPropertyOptional({ default: 0, description: '同级排序，数值越小越靠前' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  order?: number

  @ApiPropertyOptional({ description: '父部门 ID；根部门可省略或传 0', type: String })
  @IsOptional()
  @IsString()
  @MaxLength(19)
  @Matches(/^(?:0|[1-9]\d*)$/, { message: 'pid 必须是非负整数 bigint 字符串' })
  pid?: string

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  remark?: string

  @ApiProperty({ enum: DeptStatus })
  @IsIn([DeptStatus.DISABLED, DeptStatus.ENABLED])
  status: DeptStatus
}
