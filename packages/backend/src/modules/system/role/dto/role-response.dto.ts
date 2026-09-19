import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RoleStatus } from '../role.types.js'

export class RoleResponseDto {
  @ApiProperty({ description: '不可变角色标识' })
  code: string

  @ApiProperty({ description: '创建时间', type: Date })
  createTime: Date

  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ description: '是否为受保护的默认角色' })
  isDefault: boolean

  @ApiProperty()
  name: string

  @ApiProperty({ description: '菜单及按钮 ID', type: [String] })
  permissions: string[]

  @ApiPropertyOptional()
  remark?: string

  @ApiProperty({ enum: RoleStatus })
  status: RoleStatus
}

export class RoleListResponseDto {
  @ApiProperty({ type: [RoleResponseDto] })
  items: RoleResponseDto[]

  @ApiProperty({ description: '总条数' })
  total: number
}
