import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { DictService } from './dict.service.js'
import { DICT_PERMISSIONS } from './dict.types.js'
import { CreateDictDto, DictIdParamDto, DictListQueryDto, DictResponseDto, DictSubtreeQueryDto, UpdateDictDto } from './dto/dict.dto.js'

@Controller('dict')
@ApiTags('Dict')
@ApiSecurityAuth()
export class DictController {
  constructor(private readonly service: DictService) {}

  @Get('list')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取字典全树或任意节点的全部层级下级' })
  @ApiResult({ type: [DictResponseDto] })
  list(@Query() query: DictListQueryDto): Promise<DictResponseDto[]> {
    return this.service.list(query)
  }

  @Get(':id/descendants')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取任意节点的无限层级下级，默认扁平且不含自身' })
  @ApiResult({ type: [DictResponseDto] })
  descendants(@Param() params: DictIdParamDto, @Query() query: DictSubtreeQueryDto): Promise<DictResponseDto[]> {
    return this.service.list({ ...query, rootId: params.id, format: query.format ?? 'flat' })
  }

  @Get(':id')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取字典节点及其完整根路径' })
  @ApiResult({ type: DictResponseDto })
  detail(@Param() params: DictIdParamDto): Promise<DictResponseDto> {
    return this.service.detail(params.id)
  }

  @Post()
  @RequirePermissions(DICT_PERMISSIONS.CREATE)
  @ApiOperation({ summary: '新增字典节点，任意节点可继续新增下级' })
  @ApiResult({ status: 201, type: DictResponseDto })
  create(@Body() dto: CreateDictDto, @CurrentUser() user: LoginUserContext): Promise<DictResponseDto> {
    return this.service.create(dto, user.uid)
  }

  @Put(':id')
  @RequirePermissions(DICT_PERMISSIONS.UPDATE)
  @ApiOperation({ summary: '局部更新或移动字典节点，后代路径读取时自动更新' })
  @ApiResult({ type: Boolean })
  update(@Param() params: DictIdParamDto, @Body() dto: UpdateDictDto, @CurrentUser() user: LoginUserContext): Promise<boolean> {
    return this.service.update(params.id, dto, user.uid)
  }

  @Delete(':id')
  @RequirePermissions(DICT_PERMISSIONS.DELETE)
  @ApiOperation({ summary: '软删除无下级的字典节点，含停用下级时也禁止删除' })
  @ApiResult({ type: Boolean })
  remove(@Param() params: DictIdParamDto, @CurrentUser() user: LoginUserContext): Promise<boolean> {
    return this.service.remove(params.id, user.uid)
  }
}
