import type { PutUploadPolicyDto, UploadPolicyResponseDto } from './dto/upload-policy.dto.js'
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UploadPolicyEntity } from './entities/upload-policy.entity.js'
import { UploadPolicyCacheService } from './upload-policy-cache.service.js'
import { validateUploadPolicy } from './upload-policy.rules.js'

@Injectable()
export class UploadPolicyService {
  constructor(
    @InjectRepository(UploadPolicyEntity) private readonly repository: Repository<UploadPolicyEntity>,
    private readonly policyCache: UploadPolicyCacheService,
  ) {}

  async get(purpose: string): Promise<UploadPolicyResponseDto> {
    this.assertPurpose(purpose)
    const policy = await this.policyCache.get(purpose, async () => {
      const row = await this.repository.findOneBy({ purpose })
      return row ? this.toResponse(row) : null
    })
    if (!policy)
      throw new NotFoundException('上传用途未配置')
    return policy
  }

  async getEnabled(purpose: string): Promise<UploadPolicyResponseDto> {
    const policy = await this.get(purpose)
    if (!policy.enabled)
      throw new ForbiddenException('该用途的上传已禁用')
    return policy
  }

  async put(purpose: string, dto: PutUploadPolicyDto): Promise<boolean> {
    const state = validateUploadPolicy(purpose, dto)
    try {
      await this.repository.manager.transaction('SERIALIZABLE', async (manager) => {
        const repository = manager.getRepository(UploadPolicyEntity)
        const row = await repository.findOne({ where: { purpose }, lock: { mode: 'pessimistic_write' } })
        await repository.save(Object.assign(row ?? repository.create({ purpose }), state, {
          maxImageWidth: state.maxImageWidth ?? null,
          maxImageHeight: state.maxImageHeight ?? null,
        }))
      })
    }
    catch (error) {
      if (['23505', '40001', '40P01'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException('上传策略发生并发变更，请重试')
      throw error
    }
    // Do not invalidate uncommitted/rolled-back changes.
    await this.policyCache.invalidate(purpose)
    return true
  }

  private assertPurpose(purpose: string): void {
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(purpose))
      throw new UnprocessableEntityException('上传用途标识无效')
  }

  private toResponse(row: UploadPolicyEntity): UploadPolicyResponseDto {
    return {
      ...(row.maxImageWidth != null ? { maxImageWidth: row.maxImageWidth } : {}),
      ...(row.maxImageHeight != null ? { maxImageHeight: row.maxImageHeight } : {}),
      purpose: row.purpose,
      revision: row.revision,
      enabled: row.enabled,
      allowedFormats: row.allowedFormats,
      maxFileBytes: row.maxFileBytes,
      maxTotalBytes: row.maxTotalBytes,
      maxFiles: row.maxFiles,
      visibility: row.visibility,
      retentionSeconds: row.retentionSeconds,
    }
  }
}
