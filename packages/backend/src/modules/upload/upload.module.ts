import { resolve } from 'node:path'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { AttachmentBusinessRegistry } from './attachment-business.registry.js'
import { AttachmentScanner } from './attachment-scanner.service.js'
import { AttachmentService } from './attachment.service.js'
import { AttachmentAuditEntity } from './entities/attachment-audit.entity.js'
import { AttachmentReferenceEntity } from './entities/attachment-reference.entity.js'
import { AttachmentEntity } from './entities/attachment.entity.js'
import { UploadPolicyEntity } from './entities/upload-policy.entity.js'
import { LocalUploadStorage, UPLOAD_STORAGE_ROOT } from './local-upload.storage.js'
import { UploadContentValidator } from './upload-content.validator.js'
import { UploadPolicyCacheService } from './upload-policy-cache.service.js'
import { UploadPolicyController } from './upload-policy.controller.js'
import { UploadPolicyService } from './upload-policy.service.js'
import { UploadController } from './upload.controller.js'

@Module({
  imports: [TypeOrmModule.forFeature([AttachmentEntity, AttachmentReferenceEntity, AttachmentAuditEntity, UploadPolicyEntity, SysUserEntity])],
  controllers: [UploadPolicyController, UploadController],
  providers: [UploadPolicyCacheService, UploadPolicyService, AttachmentService, AttachmentBusinessRegistry, UploadContentValidator, AttachmentScanner, LocalUploadStorage, { provide: UPLOAD_STORAGE_ROOT, useFactory: () => resolve(process.cwd(), 'var', 'attachments') }],
  exports: [UploadPolicyService, AttachmentService, AttachmentBusinessRegistry],
})
export class UploadModule {}
