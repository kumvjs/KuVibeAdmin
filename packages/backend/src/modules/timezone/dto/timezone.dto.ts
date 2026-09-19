import { ApiProperty } from '@nestjs/swagger'
import { ValidateIf } from 'class-validator'
import { IsIanaTimezone } from '#/common/decorators/class-validator/is-iana-timezone.decorator.js'

export class SetTimezoneDto {
  @ApiProperty({ type: String, nullable: true, maxLength: 64, description: '固定展示时区；null 恢复跟随设备。必须提供该字段', example: 'Asia/Shanghai' })
  @ValidateIf((_object, value) => value !== null)
  @IsIanaTimezone()
  timezone: string | null
}

export class TimezoneOptionDto {
  @ApiProperty({ description: 'IANA 名称，不附加全年固定的 GMT 偏移' })
  label: string

  @ApiProperty({ example: 'Asia/Shanghai' })
  value: string
}
