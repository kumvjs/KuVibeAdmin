import type { FastifyReply } from 'fastify'
import { Controller, Get, Query, Res } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { SkipResponseTransform } from '#/common/decorators/skip-response-transform.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { ResOp } from '#/common/dto/response.dto.js'
import { PlaygroundStatusQueryDto, PlaygroundTableQueryDto, PlaygroundTableResponseDto } from './dto/playground.dto.js'
import { PLAYGROUND_BIGINT_RESPONSE } from './playground-fixtures.js'
import { PlaygroundService } from './playground.service.js'

@Controller()
@ApiTags('Playground（仅非生产环境）')
export class PlaygroundController {
  constructor(
    private readonly playgroundService: PlaygroundService,
  ) {}

  @Get('table/list')
  @ApiSecurityAuth()
  @ApiOperation({ summary: '获取确定性的 Vben 演示表格数据' })
  @ApiResult({ type: PlaygroundTableResponseDto })
  getTable(@Query() query: PlaygroundTableQueryDto): PlaygroundTableResponseDto {
    return this.playgroundService.getTable(query)
  }

  @Get('demo/bigint')
  @ApiSecurityAuth()
  @SkipResponseTransform()
  @ApiOperation({ summary: '返回包含超出 JavaScript 安全范围数字的固定 JSON' })
  @ApiResponse({
    description: '原始 JSON 数字字面量；仅用于验证前端 json-bigint 转换',
    status: 200,
  })
  getBigint(@Res() reply: FastifyReply): void {
    reply.type('application/json').send(PLAYGROUND_BIGINT_RESPONSE)
  }

  @Get('status')
  @Public()
  @SkipResponseTransform()
  @ApiOperation({ summary: '模拟指定 HTTP 状态码；缺省为 200' })
  @ApiResponse({ description: '使用标准错误信封返回指定 HTTP 状态', status: 200, type: ResOp })
  getStatus(
    @Query() query: PlaygroundStatusQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): ResOp<null> {
    reply.status(query.status)
    return ResOp.error(-1, String(query.status))
  }
}
