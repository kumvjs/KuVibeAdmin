import type { Repository } from 'typeorm'
import type { PutUploadPolicyDto } from './dto/upload-policy.dto.js'
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import { UploadPolicyEntity } from './entities/upload-policy.entity.js'
import { UploadPolicyCacheService } from './upload-policy-cache.service.js'
import { UploadPolicyController } from './upload-policy.controller.js'
import { validateUploadPolicy } from './upload-policy.rules.js'
import { UploadPolicyService } from './upload-policy.service.js'

function policy(): PutUploadPolicyDto {
  return {
    enabled: true,
    allowedFormats: ['pdf', 'docx'],
    maxFileBytes: 1024,
    maxTotalBytes: 2048,
    maxFiles: 2,
    retentionSeconds: 3600,
    visibility: 'private',
  }
}

describe('upload policy rules', () => {
  it('accepts explicit private multi-format settings', () => {
    expect(validateUploadPolicy('attachment', policy())).toEqual(policy())
  })

  it.each([
    { maxFileBytes: null },
    { maxFileBytes: '1024' },
    { maxFileBytes: 0 },
    { maxTotalBytes: 100 },
    { maxFiles: 21 },
    { retentionSeconds: 59 },
    { allowedFormats: [] },
    { allowedFormats: ['exe'] },
    { allowedFormats: ['pdf', 'pdf'] },
    { visibility: 'public' },
    { enabled: null },
    { unexpected: true },
  ])('rejects invalid policy %j', (patch) => {
    expect(() => validateUploadPolicy('attachment', { ...policy(), ...patch } as PutUploadPolicyDto))
      .toThrow(UnprocessableEntityException)
  })

  it('only permits explicit avatar images to be public', () => {
    expect(() => validateUploadPolicy('avatar', policy())).toThrow(UnprocessableEntityException)
    expect(validateUploadPolicy('avatar', { ...policy(), allowedFormats: ['jpg'], visibility: 'public' }).visibility)
      .toBe('public')
  })

  it('rejects unsafe purpose identifiers before constructing cache keys', () => {
    expect(() => validateUploadPolicy('x}:*', policy())).toThrow(UnprocessableEntityException)
  })
})

describe('upload policy service', () => {
  const cache = { get: jest.fn(), invalidate: jest.fn() }
  const repository = { findOneBy: jest.fn(), manager: { transaction: jest.fn() } }
  const service = new UploadPolicyService(
    repository as unknown as Repository<UploadPolicyEntity>,
    cache as unknown as UploadPolicyCacheService,
  )

  beforeEach(() => jest.resetAllMocks())

  it('uses a cached policy without querying its repository', async () => {
    cache.get.mockResolvedValue({ ...policy(), purpose: 'attachment', revision: 1 })
    expect((await service.getEnabled('attachment')).allowedFormats).toEqual(['pdf', 'docx'])
    expect(repository.findOneBy).not.toHaveBeenCalled()
  })

  it('rejects missing or disabled policies instead of supplying defaults', async () => {
    cache.get.mockResolvedValue(null)
    await expect(service.getEnabled('attachment')).rejects.toBeInstanceOf(NotFoundException)
    cache.get.mockResolvedValue({ ...policy(), enabled: false, purpose: 'attachment', revision: 1 })
    await expect(service.getEnabled('attachment')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('projects database entities into a cacheable DTO', async () => {
    repository.findOneBy.mockResolvedValue({ ...policy(), purpose: 'attachment', revision: 1, id: '99', createdBy: '1' })
    cache.get.mockImplementation((_purpose, loader) => loader())
    expect(await service.get('attachment')).toEqual({ ...policy(), purpose: 'attachment', revision: 1 })
  })

  it('invalidates only after a successful transactional save', async () => {
    const saved = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(value => value), save: jest.fn() }
    let committed = false
    repository.manager.transaction.mockImplementation(async (_isolation, run) => {
      await run({ getRepository: () => saved })
      expect(cache.invalidate).not.toHaveBeenCalled()
      committed = true
    })
    cache.invalidate.mockImplementation(async () => expect(committed).toBe(true))
    await expect(service.put('attachment', policy())).resolves.toBe(true)
    expect(saved.save).toHaveBeenCalledWith({ ...policy(), purpose: 'attachment', maxImageWidth: null, maxImageHeight: null })
    expect(cache.invalidate).toHaveBeenCalledWith('attachment')
  })

  it('does not invalidate after a database rollback', async () => {
    repository.manager.transaction.mockRejectedValue(new Error('rollback'))
    await expect(service.put('attachment', policy())).rejects.toThrow('rollback')
    expect(cache.invalidate).not.toHaveBeenCalled()
  })

  it('requires separate policy read and write permissions', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, UploadPolicyController.prototype.get)).toEqual('system:upload-policy:read')
    expect(Reflect.getMetadata(PERMISSION_KEY, UploadPolicyController.prototype.put)).toEqual('system:upload-policy:write')
  })
})
