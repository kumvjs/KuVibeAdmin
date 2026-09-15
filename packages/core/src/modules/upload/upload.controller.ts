import type {} from '@fastify/multipart'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Body, Controller, Delete, Get, HttpCode, HttpException, Logger, Param, PayloadTooLargeException, Post, Put, Query, Req, RequestTimeoutException, Res, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { SkipResponseTransform } from '#/common/decorators/skip-response-transform.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { AttachmentScanner } from './attachment-scanner.service.js'
import { AttachmentService } from './attachment.service.js'
import { AttachmentIdDto, AttachmentPageDto, AttachmentQueryDto, AttachmentResponseDto, SetAvatarDto, UploadQueryDto } from './dto/attachment.dto.js'
import { AttachmentEntity } from './entities/attachment.entity.js'
import { LocalUploadStorage } from './local-upload.storage.js'
import { UploadContentValidator } from './upload-content.validator.js'
import { UploadPolicyService } from './upload-policy.service.js'

@Controller()
@ApiTags('系统附件')
@ApiSecurityAuth()
export class UploadController {
  private readonly logger = new Logger(UploadController.name)
  constructor(
    private readonly attachments: AttachmentService,
    private readonly policies: UploadPolicyService,
    private readonly storage: LocalUploadStorage,
    private readonly validator: UploadContentValidator,
    private readonly scanner: AttachmentScanner,
  ) {}

  @Post('upload')
  @HttpCode(200)
  @ApiOperation({ summary: '按用途策略上传一个附件；默认 attachment，必须预先配置策略' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResult({ type: AttachmentResponseDto })
  async upload(@CurrentUser() user: LoginUserContext, @Query() query: UploadQueryDto, @Req() request: FastifyRequest): Promise<AttachmentResponseDto> {
    const policy = await this.policies.getEnabled(query.purpose ?? 'attachment')
    let pendingId: string | undefined
    let prepared: { row: AttachmentEntity, info: { extension: string, mimeType: string, size: number, sha256: string, scanStatus: 'unscanned' | 'clean' } } | undefined
    try {
      // Per-request limits override multipart defaults; preserve the single-file Vben contract.
      for await (const part of request.parts({ limits: { fields: 0, files: 1, parts: 1, fileSize: Math.min(policy.maxFileBytes, policy.maxTotalBytes) } })) {
        if (part.type !== 'file' || part.fieldname !== 'file' || pendingId)
          throw new UnprocessableEntityException('必须且只能上传一个名为 file 的文件')
        const row = await this.attachments.pending(user.uid, part.filename, policy)
        pendingId = row.id
        const stored = await this.storage.write(row.objectKey, part.file, Math.min(policy.maxFileBytes, policy.maxTotalBytes))
        if (part.file.truncated)
          throw new PayloadTooLargeException('附件超出大小限制')
        if (!stored.size)
          throw new UnprocessableEntityException('不接受空文件')
        const content = await this.validator.validate(stored.path, row.originalName, part.mimetype, policy)
        const digest = await this.storage.digest(row.objectKey)
        const scanStatus = await this.scanner.scan(stored.path)
        if (scanStatus === 'rejected')
          throw new UnprocessableEntityException('附件安全扫描未通过')
        if (digest.size > Math.min(policy.maxFileBytes, policy.maxTotalBytes))
          throw new PayloadTooLargeException('处理后的附件超出大小限制')
        prepared = { row, info: { ...content, ...digest, scanStatus } }
      }
      if (!prepared)
        throw new UnprocessableEntityException('缺少附件')
      return await this.attachments.complete(prepared.row, prepared.info, policy)
    }
    catch (error) {
      if (pendingId)
        await this.attachments.abort(pendingId)
      if (error instanceof HttpException)
        throw error
      if (/^FST_(?:FIELDS|FILES|PARTS)_LIMIT$|^FST_REQ_FILE_TOO_LARGE$/.test((error as { code?: string }).code ?? ''))
        throw new PayloadTooLargeException('上传数量、字段或大小超出限制')
      if ((error as Error).name === 'AbortError')
        throw new RequestTimeoutException('附件上传超时')
      this.logger.error('附件存储或处理失败', (error as Error).stack)
      throw new ServiceUnavailableException('附件存储或处理暂不可用')
    }
  }

  @Get('attachments/:id')
  @ApiOperation({ summary: '读取本人或业务授权的附件信息' })
  @ApiResult({ type: AttachmentResponseDto })
  detail(@Param() params: AttachmentIdDto, @CurrentUser() user: LoginUserContext) {
    return this.attachments.detail(params.id, user.uid)
  }

  @Get('attachments/:id/content')
  @SkipResponseTransform()
  @ApiOperation({ summary: '下载本人或业务授权的私有附件；须携带认证，不支持 URL 中的 Token' })
  @ApiResponse({ status: 200, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  async download(@Param() params: AttachmentIdDto, @CurrentUser() user: LoginUserContext, @Res() reply: FastifyReply) {
    return this.send(await this.attachments.download(params.id, user.uid), reply, false)
  }

  @Get('attachments/:id/public')
  @Public()
  @SkipResponseTransform()
  @ApiOperation({ summary: '读取已绑定业务且明确公开的头像图片；未绑定文件不开放' })
  @ApiResponse({ status: 200, content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } })
  async publicImage(@Param() params: AttachmentIdDto, @Res() reply: FastifyReply) {
    return this.send(await this.attachments.download(params.id, null, true), reply, true)
  }

  @Delete('attachments/:id')
  @ApiOperation({ summary: '删除本人未被业务引用的附件' })
  @ApiResult({ type: Boolean })
  remove(@Param() params: AttachmentIdDto, @CurrentUser() user: LoginUserContext) {
    return this.attachments.remove(params.id, user.uid)
  }

  @Put('user/avatar')
  @ApiOperation({ summary: '将本人 avatar 用途附件绑定为头像；null 清除，现有 avatar URL 响应保持不变' })
  @ApiResult({ type: Boolean })
  avatar(@Body() dto: SetAvatarDto, @CurrentUser() user: LoginUserContext) {
    return this.attachments.setAvatar(user.uid, dto.attachmentId)
  }

  @Get('system/attachment/list')
  @RequirePermissions('system:attachment:list')
  @ApiOperation({ summary: '管理端附件分页查询' })
  @ApiResult({ type: AttachmentPageDto })
  list(@Query() query: AttachmentQueryDto) {
    return this.attachments.list(query)
  }

  @Get('system/attachment/:id')
  @RequirePermissions('system:attachment:read')
  @ApiOperation({ summary: '管理端附件详情' })
  @ApiResult({ type: AttachmentResponseDto })
  adminDetail(@Param() params: AttachmentIdDto, @CurrentUser() user: LoginUserContext) {
    return this.attachments.detail(params.id, user.uid, true)
  }

  @Get('system/attachment/:id/content')
  @RequirePermissions('system:attachment:read')
  @SkipResponseTransform()
  @ApiOperation({ summary: '管理员下载附件，记录下载授权审计' })
  @ApiResponse({ status: 200, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  async adminDownload(@Param() params: AttachmentIdDto, @CurrentUser() user: LoginUserContext, @Res() reply: FastifyReply) {
    return this.send(await this.attachments.download(params.id, user.uid, false, true), reply, false)
  }

  @Delete('system/attachment/:id')
  @RequirePermissions('system:attachment:delete')
  @ApiOperation({ summary: '管理员删除附件；仍有引用时拒绝删除' })
  @ApiResult({ type: Boolean })
  adminRemove(@Param() params: AttachmentIdDto, @CurrentUser() user: LoginUserContext) {
    return this.attachments.remove(params.id, user.uid, true)
  }

  private send(file: Awaited<ReturnType<AttachmentService['download']>>, reply: FastifyReply, inline: boolean) {
    reply.header('Content-Type', file.mimeType)
    reply.header('Content-Length', file.size)
    reply.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)}`)
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Cache-Control', 'private, no-store')
    reply.header('Content-Security-Policy', 'default-src \'none\'; sandbox')
    return reply.send(file.stream)
  }
}
