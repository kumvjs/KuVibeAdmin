import { Module } from '@nestjs/common'
import { BillingModule } from '../billing/billing.module.js'
import { UploadModule } from '../upload/upload.module.js'
import { TasksController } from './tasks.controller.js'
import { TasksService } from './tasks.service.js'

@Module({ imports: [BillingModule, UploadModule], controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
