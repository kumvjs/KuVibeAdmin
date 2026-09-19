import { Body, Controller } from '@nestjs/common'
import { AiService } from './ai.service.js'
import { CreateAiDto } from './dto/create-ai.dto.js'
import { UpdateAiDto } from './dto/update-ai.dto.js'

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}
}
