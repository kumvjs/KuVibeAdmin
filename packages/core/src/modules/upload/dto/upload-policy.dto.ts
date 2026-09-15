import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import { UPLOAD_FORMATS, UPLOAD_MAX_BYTES } from '../upload.constants.js'

export class UploadPurposeParamDto {
  @ApiProperty({ description: '不可变用途标识，如 attachment、avatar', maxLength: 50, pattern: '^[a-z][a-z0-9-]{0,49}$' })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,49}$/)
  purpose: string
}

export class PutUploadPolicyDto {
  @ApiPropertyOptional({ description: '图片最大宽度；空值使用安全上限 4096', minimum: 1, maximum: 4096, nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4096)
  maxImageWidth?: number | null

  @ApiPropertyOptional({ description: '图片最大高度；空值使用安全上限 4096', minimum: 1, maximum: 4096, nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4096)
  maxImageHeight?: number | null

  @ApiProperty()
  @IsBoolean()
  enabled: boolean

  @ApiProperty({ enum: UPLOAD_FORMATS, isArray: true, description: '格式白名单；jpg 同时接收 .jpeg 后缀' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(UPLOAD_FORMATS.length)
  @ArrayUnique()
  @IsIn(UPLOAD_FORMATS, { each: true })
  allowedFormats: string[]

  @ApiProperty({ description: '单文件字节上限', minimum: 1, maximum: UPLOAD_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(UPLOAD_MAX_BYTES)
  maxFileBytes: number

  @ApiProperty({ description: '单请求文件内容字节总上限，不小于单文件上限', minimum: 1, maximum: UPLOAD_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(UPLOAD_MAX_BYTES)
  maxTotalBytes: number

  @ApiProperty({ description: '策略文件数量上限；单文件接口仍只接收一个文件', minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  maxFiles: number

  @ApiProperty({ enum: ['private', 'public'], description: '公开仅允许 avatar 图片策略；不会改变历史附件' })
  @IsIn(['private', 'public'])
  visibility: 'private' | 'public'

  @ApiProperty({ description: '未绑定附件保留秒数', minimum: 60, maximum: 2592000 })
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  retentionSeconds: number
}

export class UploadPolicyResponseDto extends PutUploadPolicyDto {
  @ApiProperty()
  purpose: string

  @ApiProperty({ minimum: 1, description: '数据库策略版本' })
  revision: number
}
