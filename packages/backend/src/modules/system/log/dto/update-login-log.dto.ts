import { PartialType } from '@nestjs/swagger'
import { CreateLogDto } from './create-login-log.dto.js'

export class UpdateLogDto extends PartialType(CreateLogDto) {}
