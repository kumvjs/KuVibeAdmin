import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DictStatus } from '../dict.types.js'

export class CreateDictDto {
  @ApiProperty({ description: '节点名称，首尾无空白', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^\S(?:[\s\S]*\S)?$/u)
  name: string

  @ApiProperty({ description: '稳定唯一编码，创建后不可修改', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_.-]*$/)
  code: string

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null 或 0 为根节点' })
  @IsOptional()
  @IsString()
  @MaxLength(19)
  @Matches(/^(?:0|[1-9]\d*)$/)
  pid?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000, description: 'null 表示无值，空字符串为有效值；设置后通过停用并新建替换' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  value?: string | null

  @ApiPropertyOptional({ default: false, description: '允许业务显式缓存此锚点的下级查询' })
  @IsOptional()
  @IsBoolean()
  cacheEnabled?: boolean

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 2_147_483_647 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  order?: number

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null
}

export class UpdateDictDto extends PartialType(OmitType(CreateDictDto, ['code'] as const)) {}
export class DictStatusDto {
  @ApiProperty({ enum: DictStatus })
  @IsIn([0, 1])
  status: DictStatus
}
export class DictIdParamDto {
  @ApiProperty({ type: String, example: '9007199254740993' })
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/)
  id: string
}
function queryBoolean({ value }: { value: unknown }): unknown {
  return value === 'true' ? true : value === 'false' ? false : value
}
export class DictChildrenQueryDto {
  @ApiPropertyOptional({ default: false, description: '仅显示有效分支；普通业务固定为 true' })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  enabledOnly?: boolean
}
export class DictListQueryDto {
  @ApiPropertyOptional({ enum: ['flat', 'tree'], default: 'tree' })
  @IsOptional()
  @IsIn(['flat', 'tree'])
  format?: 'flat' | 'tree'
}
export class DictSubtreeQueryDto extends DictChildrenQueryDto {
  @ApiPropertyOptional({ enum: ['flat', 'tree'], default: 'flat' })
  @IsOptional()
  @IsIn(['flat', 'tree'])
  format?: 'flat' | 'tree'

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeSelf?: boolean
}
export class DictBusinessQueryDto {
  @ApiPropertyOptional({ enum: ['flat', 'tree'], default: 'flat' })
  @IsOptional()
  @IsIn(['flat', 'tree'])
  format?: 'flat' | 'tree'

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeSelf?: boolean
}
export class DictResponseDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ type: String, nullable: true })
  pid: string | null

  @ApiProperty()
  name: string

  @ApiProperty()
  code: string

  @ApiProperty({ type: String, nullable: true })
  value: string | null

  @ApiProperty({ enum: DictStatus })
  status: DictStatus

  @ApiProperty({ enum: DictStatus, description: '自身及祖先均启用才为 1' })
  effectiveStatus: DictStatus

  @ApiProperty()
  cacheEnabled: boolean

  @ApiProperty()
  order: number

  @ApiProperty({ type: String, nullable: true })
  remark: string | null

  @ApiProperty({ type: Date })
  createTime: Date

  @ApiProperty({ type: Date })
  updateTime: Date

  @ApiProperty({ description: '存在未删除直接下级，含停用节点；索引 EXISTS 查询' })
  hasChildren: boolean

  @ApiPropertyOptional({ type: () => [DictResponseDto] })
  children?: DictResponseDto[]
}
