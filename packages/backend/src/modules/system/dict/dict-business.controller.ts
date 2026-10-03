import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { DictReadGuard } from './dict-read.guard.js'
import { DictService } from './dict.service.js'
import { DictBusinessQueryDto, DictIdParamDto, DictResponseDto } from './dto/dict.dto.js'

@Controller('dict')
@ApiTags('DictBusiness')
@ApiSecurityAuth()
@UseGuards(DictReadGuard)
export class DictBusinessController {
  constructor(private readonly service: DictService) {}

  @Get(':id/children')
  @ApiOperation({ summary: '登录业务用户读取指定节点的有效直接下级；按锚点开关可缓存' })
  @ApiResult({ type: [DictResponseDto] })
  children(@Param() params: DictIdParamDto): Promise<DictResponseDto[]> {
    return this.service.getCachedChildren(params.id)
  }

  @Get(':id/descendants')
  @ApiOperation({ summary: '登录业务用户读取指定节点有效下级；最多32层/10000节点' })
  @ApiResult({ type: [DictResponseDto] })
  descendants(@Param() params: DictIdParamDto, @Query() query: DictBusinessQueryDto): Promise<DictResponseDto[]> {
    return this.service.getCachedDescendants(params.id, query)
  }
}
