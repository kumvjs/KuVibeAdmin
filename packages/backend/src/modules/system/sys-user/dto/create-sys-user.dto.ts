import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { IsIanaTimezone } from '#/common/decorators/class-validator/is-iana-timezone.decorator.js'
import { UserStatus } from '../sys-user.types.js'

export class CreateSysUserDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string

  @ApiProperty({ description: '所属部门 ID', type: String })
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/, { message: 'deptId 必须是正整数 bigint 字符串' })
  deptId: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^\/\S*$/, { message: 'homePath 必须是以 / 开头且不包含空白的路径' })
  homePath?: string

  @ApiProperty({ description: 'Vben 展示名称', maxLength: 100, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^\S(?:.*\S)?$/u, { message: 'name 首尾不得包含空白字符' })
  name: string

  @ApiProperty({ description: '初始密码，仅接收明文输入，不会在响应中返回', maxLength: 128, minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string

  @ApiProperty({ description: '角色 ID；用户授权只通过角色完成', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(19, { each: true })
  @Matches(/^[1-9]\d*$/, { each: true, message: 'roleIds 中的 ID 必须是正整数 bigint 字符串' })
  roleIds: string[]

  @ApiProperty({ enum: UserStatus })
  @IsIn([UserStatus.DISABLED, UserStatus.ENABLED])
  status: UserStatus

  @ApiPropertyOptional({ type: String, nullable: true, description: '固定展示时区；null 表示跟随设备', maxLength: 64 })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string | null

  @ApiProperty({ description: '不可变登录账号', maxLength: 100, minLength: 4 })
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  @Matches(/^[a-z\d][\w.-]*$/i, { message: 'username 仅允许字母、数字、点、下划线和连字符' })
  username: string
}
