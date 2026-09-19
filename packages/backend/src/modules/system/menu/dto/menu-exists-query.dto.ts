import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

abstract class MenuExistsQueryDto {
  @ApiPropertyOptional({
    description: '编辑中的菜单 ID；命中该记录时不视为重复',
    type: String,
  })
  @IsOptional()
  @Type(() => String)
  @Matches(/^[1-9]\d*$/, { message: 'id 必须是正整数 bigint 字符串' })
  id?: string
}

export class MenuNameExistsQueryDto extends MenuExistsQueryDto {
  @ApiProperty({ maxLength: 30, minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  name!: string
}

export class MenuPathExistsQueryDto extends MenuExistsQueryDto {
  @ApiProperty({ maxLength: 100, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  path!: string
}
