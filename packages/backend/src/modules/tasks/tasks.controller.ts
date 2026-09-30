import { Body, ConflictException, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '../auth/decorators/index.js'
import { TaskExecutionDto, TaskHandlerDto, TaskIdDto, TaskLogPageDto, TaskLogQueryDto, TaskPageDto, TaskQueryDto, TaskResponseDto, TaskStatusDto, TaskWriteDto } from './task.dto.js'
import { TASK_HANDLERS, TasksService } from './tasks.service.js'

@Controller('system/tasks')
@ApiTags('任务调度')
@ApiSecurityAuth()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get() @RequirePermissions('system:task:list') @ApiOperation({ summary: '分页查询在线任务配置' }) @ApiResult({ type: TaskPageDto })
  list(@Query() query: TaskQueryDto) { return this.tasks.list(query) }

  @Get('handlers') @RequirePermissions('system:task:list') @ApiOperation({ summary: '查询已注册处理器白名单' }) @ApiResult({ type: [TaskHandlerDto] })
  handlers() { return TASK_HANDLERS }

  @Get('logs') @RequirePermissions('system:task:log') @ApiOperation({ summary: '分页查询全部执行日志，包含已删除任务快照' }) @ApiResult({ type: TaskLogPageDto })
  allLogs(@Query() query: TaskLogQueryDto) { return this.tasks.logs(undefined, query) }

  @Post() @HttpCode(200) @RequirePermissions('system:task:create') @ApiOperation({ summary: '创建在线任务，最多 100 个' }) @ApiResult({ type: TaskResponseDto })
  create(@Body() dto: TaskWriteDto) { return this.tasks.create(dto) }

  @Patch(':id') @RequirePermissions('system:task:update') @ApiOperation({ summary: '更新完整任务配置，跨实例最多十秒同步' }) @ApiResult({ type: TaskResponseDto })
  update(@Param() params: TaskIdDto, @Body() dto: TaskWriteDto) { return this.tasks.update(params.id, dto) }

  @Delete(':id') @RequirePermissions('system:task:delete') @ApiOperation({ summary: '删除配置并保留历史执行日志' }) @ApiResult({ type: Boolean })
  remove(@Param() params: TaskIdDto) { return this.tasks.remove(params.id) }

  @Post(':id/status') @HttpCode(200) @RequirePermissions('system:task:update') @ApiOperation({ summary: '启用或停用定时触发，手动运行不受启停限制' }) @ApiResult({ type: TaskResponseDto })
  status(@Param() params: TaskIdDto, @Body() dto: TaskStatusDto) { return this.tasks.status(params.id, dto.enabled) }

  @Post(':id/run') @HttpCode(200) @RequirePermissions('system:task:run') @ApiOperation({ summary: '手动执行并返回结果，同任务并发执行返回 409' }) @ApiResult({ type: TaskExecutionDto })
  async run(@Param() params: TaskIdDto) {
    const result = await this.tasks.run(params.id)
    if (!result)
      throw new ConflictException('任务执行请求已存在')
    return result
  }

  @Get(':id/logs') @RequirePermissions('system:task:log') @ApiOperation({ summary: '分页查询执行审计，错误只保存安全代码' }) @ApiResult({ type: TaskLogPageDto })
  logs(@Param() params: TaskIdDto, @Query() query: TaskLogQueryDto) { return this.tasks.logs(params.id, query) }
}
