import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags, getSchemaPath } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { ResOp } from '#/common/dto/response.dto.js'
import { SetTimezoneDto, TimezoneOptionDto } from './dto/timezone.dto.js'
import { TimezoneService } from './timezone.service.js'

@ApiTags('时区展示偏好')
@Controller('timezone')
export class TimezoneController {
  constructor(private readonly service: TimezoneService) {}

  @Public()
  @Get('getTimezoneOptions')
  @ApiOperation({ summary: '获取支持的时区选项；跟随设备由前端单独提供' })
  @ApiResult({ type: [TimezoneOptionDto] })
  getOptions(): TimezoneOptionDto[] {
    return this.service.getOptions()
  }

  @Get('getTimezone')
  @ApiSecurityAuth()
  @ApiOperation({ summary: '读取当前用户展示时区；null 表示跟随设备' })
  @ApiExtraModels(ResOp)
  @ApiOkResponse({ schema: {
    allOf: [
      { $ref: getSchemaPath(ResOp) },
      { properties: { data: { type: 'string', nullable: true, example: null } } },
    ],
  } })
  getTimezone(@CurrentUser() user: LoginUserContext): Promise<string | null> {
    return this.service.getTimezone(user.uid)
  }

  @Post('setTimezone')
  @HttpCode(200)
  @ApiSecurityAuth()
  @ApiOperation({ summary: '保存当前用户展示偏好；null 恢复跟随设备，不影响业务权益' })
  @ApiResult({ type: Boolean })
  setTimezone(@CurrentUser() user: LoginUserContext, @Body() dto: SetTimezoneDto): Promise<boolean> {
    return this.service.setTimezone(user.uid, dto.timezone)
  }
}
