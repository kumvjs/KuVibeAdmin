import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches, MaxLength } from 'class-validator'

export class MenuIdParamDto {
  @ApiProperty({ description: '菜单 ID', example: '9007199254740993', type: String })
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/, { message: 'id 必须是正整数 bigint 字符串' })
  id: string
}
