import type { MultipartFile } from '@fastify/multipart'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Controller, Get, HttpException, PayloadTooLargeException, Post, Query, Req, Res, UnprocessableEntityException } from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { SkipResponseTransform } from '#/common/decorators/skip-response-transform.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { ResOp } from '#/common/dto/response.dto.js'
import { PlaygroundStatusQueryDto, PlaygroundTableQueryDto, PlaygroundTableResponseDto, UploadResponseDto } from './dto/playground.dto.js'
import { PLAYGROUND_BIGINT_RESPONSE } from './playground-fixtures.js'
import { PlaygroundUploadService } from './playground-upload.service.js'
import { PLAYGROUND_UPLOAD_MAX_BYTES } from './playground.constants.js'
import { PlaygroundService } from './playground.service.js'

@Controller()
@ApiTags('Playground（仅非生产环境）')
export class PlaygroundController {
  constructor(
    private readonly playgroundService: PlaygroundService,
    private readonly uploadService: PlaygroundUploadService,
  ) {}

  @Get('table/list')
  @ApiSecurityAuth()
  @ApiOperation({ summary: '获取确定性的 Vben 演示表格数据' })
  @ApiResult({ type: PlaygroundTableResponseDto })
  getTable(@Query() query: PlaygroundTableQueryDto): PlaygroundTableResponseDto {
    return this.playgroundService.getTable(query)
  }

  @Post('upload')
  @ApiSecurityAuth()
  @ApiOperation({ summary: '上传临时 Playground 图片' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      required: ['file'],
      type: 'object',
      properties: {
        file: { format: 'binary', type: 'string' },
      },
    },
  })
  @ApiResult({ type: UploadResponseDto })
  async upload(@Req() request: FastifyRequest): Promise<UploadResponseDto> {
    return this.uploadService.storeImage(await this.readSingleFile(request))
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

  private async readSingleFile(request: FastifyRequest): Promise<{ buffer: Buffer, mimeType: string }> {
    try {
      let upload: { buffer: Buffer, mimeType: string } | undefined
      for await (const part of request.parts({
        limits: {
          fields: 0,
          files: 1,
          fileSize: PLAYGROUND_UPLOAD_MAX_BYTES,
          parts: 1,
        },
      })) {
        if (part.type === 'field')
          throw new UnprocessableEntityException('上传请求不能包含额外字段')
        if (part.fieldname !== 'file' || upload)
          throw new UnprocessableEntityException('必须且只能上传一个名为 file 的文件')
        upload = {
          buffer: await this.readBuffer(part),
          mimeType: part.mimetype,
        }
      }
      if (!upload)
        throw new UnprocessableEntityException('缺少上传文件')
      return upload
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error
      if (this.isMultipartLimitError(error))
        throw new PayloadTooLargeException(`只能上传一个且不超过 ${PLAYGROUND_UPLOAD_MAX_BYTES} 字节的文件`)
      throw error
    }
  }

  private async readBuffer(file: MultipartFile): Promise<Buffer> {
    try {
      const buffer = await file.toBuffer()
      if (file.file.truncated)
        throw new PayloadTooLargeException(`图片大小不能超过 ${PLAYGROUND_UPLOAD_MAX_BYTES} 字节`)
      return buffer
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error
      if (this.isMultipartLimitError(error))
        throw new PayloadTooLargeException(`图片大小不能超过 ${PLAYGROUND_UPLOAD_MAX_BYTES} 字节`)
      throw error
    }
  }

  private isMultipartLimitError(error: unknown): boolean {
    const code = (error as { code?: string })?.code
    return code === 'FST_FIELDS_LIMIT'
      || code === 'FST_FILES_LIMIT'
      || code === 'FST_PARTS_LIMIT'
      || code === 'FST_REQ_FILE_TOO_LARGE'
  }
}
