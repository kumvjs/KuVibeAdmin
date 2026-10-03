import { Module } from '@nestjs/common'
import { DictBusinessController } from './dict-business.controller.js'
import { DictReadGuard } from './dict-read.guard.js'
import { DictModule } from './dict.module.js'

@Module({
  imports: [DictModule],
  controllers: [DictBusinessController],
  providers: [DictReadGuard],
})
export class DictBusinessModule {}
