import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { CreateSysUserDto } from './dto/create-sys-user.dto.js'
import { SysUserIdParamDto } from './dto/sys-user-id-param.dto.js'
import { SysUserListResponseDto } from './dto/sys-user-response.dto.js'
import { QuerySysUserListDto } from './dto/sys-user.dto.js'
import { UpdateSysUserDto } from './dto/update-sys-user.dto.js'
import { SysUserService } from './sys-user.service.js'
import { SYS_USER_PERMISSIONS } from './sys-user.types.js'

@Controller('user')
@ApiSecurityAuth()
export class SysUserController {
  constructor(private readonly sysUserService: SysUserService) {}

  @Get('list')
  @RequirePermissions(SYS_USER_PERMISSIONS.LIST)
  @ApiOperation({ summary: '分页查询系统用户' })
  @ApiResult({ type: SysUserListResponseDto })
  async list(@Query() query: QuerySysUserListDto): Promise<SysUserListResponseDto> {
    return this.sysUserService.list(query)
  }

  @Post()
  @RequirePermissions(SYS_USER_PERMISSIONS.CREATE)
  @ApiOperation({ summary: '新增系统用户并分配角色' })
  @ApiResult({ status: 201, type: Boolean })
  async create(@Body() dto: CreateSysUserDto): Promise<boolean> {
    return this.sysUserService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(SYS_USER_PERMISSIONS.UPDATE)
  @ApiOperation({ summary: '修改系统用户、重置密码或分配角色' })
  @ApiResult({ type: Boolean })
  async update(
    @Param() params: SysUserIdParamDto,
    @Body() dto: UpdateSysUserDto,
  ): Promise<boolean> {
    return this.sysUserService.update(params.id, dto)
  }

  @Delete(':id')
  @RequirePermissions(SYS_USER_PERMISSIONS.DELETE)
  @ApiOperation({ summary: '删除系统用户' })
  @ApiResult({ type: Boolean })
  async remove(@Param() params: SysUserIdParamDto): Promise<boolean> {
    return this.sysUserService.remove(params.id)
  }
}
