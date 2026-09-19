import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { APP_CONFIG } from '#/config/app.config.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { AttachmentAuditEntity } from './entities/attachment-audit.entity.js'
import { AttachmentReferenceEntity } from './entities/attachment-reference.entity.js'
import { AttachmentEntity } from './entities/attachment.entity.js'
import { UploadPolicyEntity } from './entities/upload-policy.entity.js'
import { UploadPolicyCacheService } from './upload-policy-cache.service.js'
import { UploadPolicyController } from './upload-policy.controller.js'
import { UploadModule } from './upload.module.js'

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }))

describe('upload module dependency injection', () => {
  it('resolves the real controllers and services with repository and shared-cache providers', async () => {
    // Supply the normally global cache dependency without starting Redis.
    const builder = Test.createTestingModule({ imports: [UploadModule] })
    for (const entity of [AttachmentEntity, AttachmentReferenceEntity, UploadPolicyEntity, AttachmentAuditEntity, SysUserEntity])
      builder.overrideProvider(getRepositoryToken(entity)).useValue({})
    builder.useMocker((token) => {
      if (token === CacheService)
        return { getClient: jest.fn() }
      if (token === APP_CONFIG.KEY)
        return { globalPrefix: 'api' }
      throw new Error(`Unexpected dependency: ${String(token)}`)
    })
    const module = await builder.compile()
    try {
      expect(module.get(UploadPolicyController)).toBeInstanceOf(UploadPolicyController)
      expect(module.get(UploadPolicyCacheService)).toBeInstanceOf(UploadPolicyCacheService)
    }
    finally {
      await module.close()
    }
  })
})
