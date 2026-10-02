import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
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

  @ApiProperty({ description: '全局唯一编码，小写字母开头，可含数字、点、下划线及短横线', maxLength: 100, example: 'system.user.status' })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_.-]*$/)
  code: string

  @ApiPropertyOptional({ type: String, nullable: true, description: '父节点 ID；null 或 0 为根节点' })
  @IsOptional()
  @IsString()
  @MaxLength(19)
  @Matches(/^(?:0|[1-9]\d*)$/)
  pid?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000, description: '节点值；null 清空，空字符串作为有效值保存' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  value?: string | null

  @ApiPropertyOptional({ enum: DictStatus, default: DictStatus.ENABLED })
  @IsOptional()
  @IsIn([DictStatus.DISABLED, DictStatus.ENABLED])
  status?: DictStatus

  @ApiPropertyOptional({ description: '同级排序，越小越靠前', default: 0, minimum: 0, maximum: 2_147_483_647 })
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

export class UpdateDictDto extends PartialType(CreateDictDto) {}

export class DictIdParamDto {
  @ApiProperty({ type: String, example: '9007199254740993' })
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/)
  id: string
}

function queryBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return value
}

export class DictSubtreeQueryDto {
  @ApiPropertyOptional({ enum: ['tree', 'flat'], default: 'tree', description: 'flat 返回按树序排列的全部节点，无 children 字段' })
  @IsOptional()
  @IsIn(['tree', 'flat'])
  format?: 'tree' | 'flat'

  @ApiPropertyOptional({ type: Boolean, default: false, description: '指定根节点时是否包含自身；全树查询始终包含根节点' })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeSelf?: boolean

  @ApiPropertyOptional({ type: Boolean, default: false, description: '只返回自身及全部祖先均启用的节点；停用分支整体裁剪' })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  enabledOnly?: boolean
}

export class DictListQueryDto extends DictSubtreeQueryDto {
  @ApiPropertyOptional({ type: String, description: '从任意节点查全部层级下级，与 rootCode 互斥' })
  @IsOptional()
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/)
  rootId?: string

  @ApiPropertyOptional({ description: '用全局唯一编码定位节点，与 rootId 互斥', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_.-]*$/)
  rootCode?: string
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

  @ApiProperty({ enum: DictStatus, description: '自身及全部祖先均启用才为 1' })
  effectiveStatus: DictStatus

  @ApiProperty()
  order: number

  @ApiProperty({ type: String, nullable: true })
  remark: string | null

  @ApiProperty({ type: Date })
  createTime: Date

  @ApiProperty({ type: Date })
  updateTime: Date

  @ApiProperty({ example: '/1/2/3/', description: '根到自身的完整 ID 路径，首尾带 /；ID 保持字符串' })
  fullPathId: string

  @ApiProperty({ example: '系统 / 用户状态 / 启用', description: '名称展示路径；程序消费请使用 pathNames' })
  fullPathName: string

  @ApiProperty({ type: [String], description: '根到自身的 ID 数组' })
  pathIds: string[]

  @ApiProperty({ type: [String], description: '根到自身的名称数组，可无歧义处理名称包含 / 的情况' })
  pathNames: string[]

  @ApiProperty({ description: '从 1 开始的绝对层级' })
  depth: number

  @ApiProperty({ description: '是否有未删除的直接下级，含停用下级' })
  hasChildren: boolean

  @ApiPropertyOptional({ type: () => [DictResponseDto] })
  children?: DictResponseDto[]
}
