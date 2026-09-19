import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { RoleStatus } from '../role.types.js'

export class CreateRoleDto {
  @ApiPropertyOptional({
    description: '不可变角色标识；省略时由服务生成',
    example: 'finance-manager',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9:_-]*$/, { message: 'code 必须以小写字母开头且仅包含小写字母、数字、冒号、下划线或连字符' })
  code?: string

  @ApiProperty({ maxLength: 50, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^\S(?:.*\S)?$/u, { message: 'name 首尾不得包含空白字符' })
  name: string

  @ApiPropertyOptional({ default: [], description: '菜单及按钮 ID', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1_000)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(19, { each: true })
  @Matches(/^[1-9]\d*$/, { each: true, message: 'permissions 中的 ID 必须是正整数 bigint 字符串' })
  permissions?: string[]

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string

  @ApiProperty({ enum: RoleStatus })
  @IsIn([RoleStatus.DISABLED, RoleStatus.ENABLED])
  status: RoleStatus
}
