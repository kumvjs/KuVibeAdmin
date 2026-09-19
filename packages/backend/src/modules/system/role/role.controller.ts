import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { CreateRoleDto } from './dto/create-role.dto.js'
import { RoleIdParamDto } from './dto/role-id-param.dto.js'
import { RoleListQueryDto } from './dto/role-list-query.dto.js'
import { RoleListResponseDto } from './dto/role-response.dto.js'
import { UpdateRoleDto } from './dto/update-role.dto.js'
import { RoleService } from './role.service.js'
import { ROLE_PERMISSIONS } from './role.types.js'

@Controller('role')
@ApiSecurityAuth()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get('list')
  @RequirePermissions(ROLE_PERMISSIONS.LIST)
  @ApiOperation({ summary: '分页查询角色' })
  @ApiResult({ type: RoleListResponseDto })
  async list(@Query() query: RoleListQueryDto): Promise<RoleListResponseDto> {
    return this.roleService.list(query)
  }

  @Post()
  @RequirePermissions(ROLE_PERMISSIONS.CREATE)
  @ApiOperation({ summary: '新增角色' })
  @ApiResult({ status: 201, type: Boolean })
  async create(@Body() dto: CreateRoleDto): Promise<boolean> {
    return this.roleService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(ROLE_PERMISSIONS.UPDATE)
  @ApiOperation({ summary: '修改角色及菜单授权' })
  @ApiResult({ type: Boolean })
  async update(
    @Param() params: RoleIdParamDto,
    @Body() dto: UpdateRoleDto,
  ): Promise<boolean> {
    return this.roleService.update(params.id, dto)
  }

  @Delete(':id')
  @RequirePermissions(ROLE_PERMISSIONS.DELETE)
  @ApiOperation({ summary: '删除角色' })
  @ApiResult({ type: Boolean })
  async remove(@Param() params: RoleIdParamDto): Promise<boolean> {
    return this.roleService.remove(params.id)
  }
}
