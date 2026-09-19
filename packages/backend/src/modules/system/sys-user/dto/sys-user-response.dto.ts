import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { UserStatus } from '../sys-user.types.js'

export class SysUserResponseDto {
  @ApiProperty({ description: '创建时间', type: Date })
  createTime: Date

  @ApiProperty({ nullable: true, type: String })
  deptId: string | null

  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ description: 'Vben 展示名称' })
  name: string

  @ApiPropertyOptional()
  remark?: string

  @ApiProperty({ description: '角色 ID', type: [String] })
  roleIds: string[]

  @ApiProperty({ enum: UserStatus })
  status: UserStatus

  @ApiProperty()
  username: string
}

export class SysUserListResponseDto {
  @ApiProperty({ type: [SysUserResponseDto] })
  items: SysUserResponseDto[]

  @ApiProperty({ description: '总条数' })
  total: number
}
