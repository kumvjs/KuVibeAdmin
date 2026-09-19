import { UnprocessableEntityException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { PutUploadPolicyDto, UploadPurposeParamDto } from './dto/upload-policy.dto.js'

export function validateUploadPolicy(purpose: string, input: PutUploadPolicyDto): PutUploadPolicyDto {
  const params = plainToInstance(UploadPurposeParamDto, { purpose })
  const dto = plainToInstance(PutUploadPolicyDto, input)
  if (validateSync(params).length || validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    throw new UnprocessableEntityException('上传策略参数无效')
  if (dto.maxTotalBytes < dto.maxFileBytes)
    throw new UnprocessableEntityException('请求总大小不得小于单文件大小')
  if (dto.visibility === 'public' && (purpose !== 'avatar' || dto.allowedFormats.some(format => !['jpg', 'png', 'webp', 'gif'].includes(format))))
    throw new UnprocessableEntityException('只有 avatar 图片策略允许公开访问')
  if (purpose === 'avatar' && dto.allowedFormats.some(format => !['jpg', 'png', 'webp', 'gif'].includes(format)))
    throw new UnprocessableEntityException('头像策略只能允许图片格式')
  return dto
}
