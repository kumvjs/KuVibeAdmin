import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator'

export class AttachmentIdDto {
  @ApiProperty({ type: String, description: '正整数 bigint 附件 ID' })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  id: string
}

export class UploadQueryDto {
  @ApiPropertyOptional({ default: 'attachment', pattern: '^[a-z][a-z0-9-]{0,49}$' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9-]{0,49}$/)
  purpose?: string
}

export class SetAvatarDto {
  @ApiProperty({ type: String, nullable: true, description: '本人已上传的 avatar 附件 ID；null 清除头像' })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  attachmentId: string | null
}

export class AttachmentQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9-]{0,49}$/)
  purpose?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z0-9]{1,20}$/)
  extension?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(/^[1-9]\d{0,18}$/)
  ownerId?: string

  @ApiPropertyOptional({ enum: ['pending', 'ready', 'deleting', 'deleted'] })
  @IsOptional()
  @IsIn(['pending', 'ready', 'deleting', 'deleted'])
  status?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  startTime?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  endTime?: string
}

export class AttachmentResponseDto {
  @ApiProperty({ type: String })
  id: string

  @ApiProperty({ description: '公开图片地址或需携带认证的下载地址；未绑定公开图片暂不可访问' })
  url: string

  @ApiProperty()
  originalName: string

  @ApiProperty()
  mimeType: string

  @ApiProperty({ type: String })
  sizeBytes: string

  @ApiProperty()
  purpose: string

  @ApiProperty({ enum: ['private', 'public'] })
  visibility: string

  @ApiProperty()
  status: string

  @ApiProperty({ enum: ['unscanned', 'clean', 'rejected'], description: '未配置杀毒扫描时始终是 unscanned，不代表已安全扫描' })
  scanStatus: string

  @ApiProperty({ type: String })
  ownerId: string

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string
}

export class AttachmentPageDto {
  @ApiProperty({ type: [AttachmentResponseDto] })
  items: AttachmentResponseDto[]

  @ApiProperty()
  total: number
}
