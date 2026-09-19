import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { PutUploadPolicyDto, UploadPolicyResponseDto, UploadPurposeParamDto } from './dto/upload-policy.dto.js'
import { UploadPolicyService } from './upload-policy.service.js'
import { UPLOAD_POLICY_PERMISSIONS } from './upload.constants.js'

@Controller('system/upload-policy')
@ApiTags('上传策略')
@ApiSecurityAuth()
export class UploadPolicyController {
  constructor(private readonly policies: UploadPolicyService) {}

  @Get(':purpose')
  @RequirePermissions(UPLOAD_POLICY_PERMISSIONS.READ)
  @ApiOperation({ summary: '读取用途上传策略（Redis 缓存）' })
  @ApiResult({ type: UploadPolicyResponseDto })
  get(@Param() params: UploadPurposeParamDto): Promise<UploadPolicyResponseDto> {
    return this.policies.get(params.purpose)
  }

  @Put(':purpose')
  @RequirePermissions(UPLOAD_POLICY_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '创建或完整替换用途上传策略；提交后刷新缓存，刷新失败返回 503 并保留已提交数据' })
  @ApiResult({ type: Boolean })
  put(@Param() params: UploadPurposeParamDto, @Body() dto: PutUploadPolicyDto): Promise<boolean> {
    return this.policies.put(params.purpose, dto)
  }
}
