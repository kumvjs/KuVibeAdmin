import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { CreateMenuDto } from './dto/create-menu.dto.js'
import { MenuNameExistsQueryDto, MenuPathExistsQueryDto } from './dto/menu-exists-query.dto.js'
import { MenuIdParamDto } from './dto/menu-id-param.dto.js'
import { UpdateMenuDto } from './dto/update-menu.dto.js'
import { VbenMenuResponseDto } from './dto/vben-menu.dto.js'
import { MenuService } from './menu.service.js'
import { MENU_PERMISSIONS } from './menu.types.js'

@Controller('system/menu')
@ApiSecurityAuth()
export class SystemMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('list')
  @RequirePermissions(MENU_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取完整菜单管理树' })
  @ApiResult({ type: [VbenMenuResponseDto] })
  async list(): Promise<VbenMenuResponseDto[]> {
    return this.menuService.getSystemMenuList()
  }

  @Get('name-exists')
  @RequirePermissions(MENU_PERMISSIONS.LIST)
  @ApiOperation({ summary: '检查菜单名称是否已存在' })
  @ApiResult({ type: Boolean })
  async nameExists(@Query() query: MenuNameExistsQueryDto): Promise<boolean> {
    return this.menuService.isMenuNameExists(query.name, query.id)
  }

  @Get('path-exists')
  @RequirePermissions(MENU_PERMISSIONS.LIST)
  @ApiOperation({ summary: '检查菜单路径是否已存在' })
  @ApiResult({ type: Boolean })
  async pathExists(@Query() query: MenuPathExistsQueryDto): Promise<boolean> {
    return this.menuService.isMenuPathExists(query.path, query.id)
  }

  @Post()
  @RequirePermissions(MENU_PERMISSIONS.CREATE)
  @ApiOperation({ summary: '新增菜单' })
  @ApiResult({ status: 201, type: Boolean })
  async create(@Body() dto: CreateMenuDto): Promise<boolean> {
    return this.menuService.createMenu(dto)
  }

  @Put(':id')
  @RequirePermissions(MENU_PERMISSIONS.UPDATE)
  @ApiOperation({ summary: '修改菜单' })
  @ApiResult({ type: Boolean })
  async update(
    @Param() params: MenuIdParamDto,
    @Body() dto: UpdateMenuDto,
  ): Promise<boolean> {
    return this.menuService.updateMenu(params.id, dto)
  }

  @Delete(':id')
  @RequirePermissions(MENU_PERMISSIONS.DELETE)
  @ApiOperation({ summary: '删除菜单' })
  @ApiResult({ type: Boolean })
  async remove(@Param() params: MenuIdParamDto): Promise<boolean> {
    return this.menuService.deleteMenu(params.id)
  }
}
