import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { DeptService } from './dept.service.js'
import { DEPT_PERMISSIONS } from './dept.types.js'
import { CreateDeptDto } from './dto/create-dept.dto.js'
import { DeptIdParamDto } from './dto/dept-id-param.dto.js'
import { DeptResponseDto } from './dto/dept-response.dto.js'
import { UpdateDeptDto } from './dto/update-dept.dto.js'

@Controller('dept')
@ApiSecurityAuth()
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  @Get('list')
  @RequirePermissions(DEPT_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取部门树' })
  @ApiResult({ type: [DeptResponseDto] })
  async list(): Promise<DeptResponseDto[]> {
    return this.deptService.list()
  }

  @Post()
  @RequirePermissions(DEPT_PERMISSIONS.CREATE)
  @ApiOperation({ summary: '新增部门' })
  @ApiResult({ status: 201, type: Boolean })
  async create(@Body() dto: CreateDeptDto): Promise<boolean> {
    return this.deptService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(DEPT_PERMISSIONS.UPDATE)
  @ApiOperation({ summary: '修改部门' })
  @ApiResult({ type: Boolean })
  async update(
    @Param() params: DeptIdParamDto,
    @Body() dto: UpdateDeptDto,
  ): Promise<boolean> {
    return this.deptService.update(params.id, dto)
  }

  @Delete(':id')
  @RequirePermissions(DEPT_PERMISSIONS.DELETE)
  @ApiOperation({ summary: '删除部门' })
  @ApiResult({ type: Boolean })
  async remove(@Param() params: DeptIdParamDto): Promise<boolean> {
    return this.deptService.remove(params.id)
  }
}
