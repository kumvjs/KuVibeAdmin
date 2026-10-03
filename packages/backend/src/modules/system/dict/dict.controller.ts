import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { DictService } from './dict.service.js'
import { DICT_PERMISSIONS } from './dict.types.js'
import { CreateDictDto, DictChildrenQueryDto, DictIdParamDto, DictListQueryDto, DictResponseDto, DictStatusDto, DictSubtreeQueryDto, UpdateDictDto } from './dto/dict.dto.js'

@Controller('dict')
@ApiTags('Dict')
@ApiSecurityAuth()
export class DictController {
  constructor(private readonly service: DictService) {}

  @Get('list')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '管理完整字典树/集合；必须具备 system:dict:list，普通业务禁止依赖' })
  @ApiResult({ type: [DictResponseDto] })
  list(@Query() query: DictListQueryDto): Promise<DictResponseDto[]> {
    return this.service.adminList(query.format)
  }

  @Get('roots')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '管理树初始化，只返回根节点' })
  @ApiResult({ type: [DictResponseDto] })
  roots(): Promise<DictResponseDto[]> {
    return this.service.roots()
  }

  @Get(':id/children')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '管理按层加载直接下级，不加载子树' })
  @ApiResult({ type: [DictResponseDto] })
  children(@Param() params: DictIdParamDto, @Query() query: DictChildrenQueryDto): Promise<DictResponseDto[]> {
    return this.service.getChildren(params.id, query.enabledOnly)
  }

  @Get(':id/descendants')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '管理指定节点全部下级，默认 flat，不含自身' })
  @ApiResult({ type: [DictResponseDto] })
  descendants(@Param() params: DictIdParamDto, @Query() query: DictSubtreeQueryDto): Promise<DictResponseDto[]> {
    return this.service.getDescendants(params.id, query)
  }

  @Get(':id')
  @RequirePermissions(DICT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '管理节点详情，不加载整树或派生路径' })
  @ApiResult({ type: DictResponseDto })
  detail(@Param() params: DictIdParamDto): Promise<DictResponseDto> {
    return this.service.detail(params.id)
  }

  @Post()
  @RequirePermissions(DICT_PERMISSIONS.CREATE)
  @ApiOperation({ summary: '新增启用字典节点，编码创建后不可修改' })
  @ApiResult({ status: 201, type: DictResponseDto })
  create(@Body() dto: CreateDictDto, @CurrentUser() user: LoginUserContext): Promise<DictResponseDto> {
    return this.service.create(dto, user.uid)
  }

  @Put(':id')
  @RequirePermissions(DICT_PERMISSIONS.UPDATE)
  @ApiOperation({ summary: '编辑或移动节点，已设置业务值通过停用并新建替换' })
  @ApiResult({ type: Boolean })
  update(@Param() params: DictIdParamDto, @Body() dto: UpdateDictDto, @CurrentUser() user: LoginUserContext): Promise<boolean> {
    return this.service.update(params.id, dto, user.uid)
  }

  @Put(':id/status')
  @RequirePermissions(DICT_PERMISSIONS.DISABLE)
  @ApiOperation({ summary: '启用/停用字典，保留历史节点' })
  @ApiResult({ type: Boolean })
  status(@Param() params: DictIdParamDto, @Body() dto: DictStatusDto, @CurrentUser() user: LoginUserContext): Promise<boolean> {
    return this.service.setStatus(params.id, dto.status, user.uid)
  }
}
