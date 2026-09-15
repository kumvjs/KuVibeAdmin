import type { EntityManager } from 'typeorm'
import type { AppConfig } from '#/config/app.config.js'
import type { AttachmentBusiness } from './attachment-business.registry.js'
import type { AttachmentQueryDto, AttachmentResponseDto } from './dto/attachment.dto.js'
import type { UploadPolicyResponseDto } from './dto/upload-policy.dto.js'
import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'
import { APP_CONFIG } from '#/config/app.config.js'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { userKeys } from '#/shared/cache/keys/user.keys.js'
import { AttachmentBusinessRegistry } from './attachment-business.registry.js'
import { AttachmentAuditEntity } from './entities/attachment-audit.entity.js'
import { AttachmentReferenceEntity } from './entities/attachment-reference.entity.js'
import { AttachmentEntity } from './entities/attachment.entity.js'
import { LocalUploadStorage } from './local-upload.storage.js'

@Injectable()
export class AttachmentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentService.name)
  private timer?: ReturnType<typeof setInterval>
  private cleanupTask?: Promise<void>

  constructor(
    @InjectRepository(AttachmentEntity) private readonly repository: Repository<AttachmentEntity>,
    private readonly storage: LocalUploadStorage,
    private readonly businesses: AttachmentBusinessRegistry,
    private readonly cache: CacheService,
    @Inject(APP_CONFIG.KEY) private readonly appConfig: AppConfig,
  ) {}

  onModuleInit() {
    const self = async (manager: EntityManager, business: AttachmentBusiness, uid: string) =>
      business.field === 'avatar' && business.businessId === uid
      && await manager.getRepository(SysUserEntity).existsBy({ id: uid, status: 1 })
    this.businesses.register('user', {
      purpose: 'avatar',
      canRead: self,
      canBind: self,
      isPublic: async (manager, business, attachmentId) => business.field === 'avatar'
        && await manager.getRepository(SysUserEntity).existsBy({ id: business.businessId, status: 1, avatar: this.url(attachmentId, true) }),
    })
    this.timer = setInterval(() => {
      if (!this.cleanupTask) {
        this.cleanupTask = this.cleanup().catch(() => this.logger.error('附件清理失败，下一周期重试')).finally(() => {
          this.cleanupTask = undefined
        })
      }
    }, 60_000)
    this.timer.unref()
  }

  async onModuleDestroy() {
    if (this.timer)
      clearInterval(this.timer)
    await this.cleanupTask
  }

  assertId(id: string): void {
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
      throw new UnprocessableEntityException('附件 ID 超出 bigint 范围')
  }

  url(id: string, publicImage: boolean): string {
    const prefix = this.appConfig.globalPrefix.replace(/^\/+|\/+$/g, '')
    const path = `${prefix ? `/${prefix}` : ''}/attachments/${id}/${publicImage ? 'public' : 'content'}`
    return this.appConfig.baseUrl ? new URL(path, new URL(this.appConfig.baseUrl).origin).toString() : path
  }

  response(row: AttachmentEntity): AttachmentResponseDto {
    return {
      id: row.id,
      url: this.url(row.id, row.visibility === 'public'),
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      purpose: row.purpose,
      visibility: row.visibility,
      status: row.status,
      scanStatus: row.scanStatus,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
    }
  }

  async pending(ownerId: string, name: string, policy: UploadPolicyResponseDto): Promise<AttachmentEntity> {
    if (!name || name.length > 255 || /[\\/]/u.test(name) || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      throw new UnprocessableEntityException('文件名无效')
    return this.repository.save(this.repository.create({
      ownerId,
      originalName: name,
      purpose: policy.purpose,
      policyRevision: policy.revision,
      storageDriver: 'local',
      objectKey: randomUUID(),
      mimeType: '',
      extension: '',
      sha256: '',
      sizeBytes: '0',
      status: 'pending',
      visibility: policy.visibility,
      scanStatus: 'unscanned',
      // Longer than the bounded request/inspection timeout; a crashed request is reclaimable.
      expiresAt: new Date(Date.now() + 15 * 60_000),
      lastError: null,
    }))
  }

  async complete(row: AttachmentEntity, info: { mimeType: string, extension: string, size: number, sha256: string, scanStatus?: 'unscanned' | 'clean' }, policy: UploadPolicyResponseDto) {
    await this.repository.manager.transaction(async (manager) => {
      const result = await manager.getRepository(AttachmentEntity).update({ id: row.id, status: 'pending' }, {
        mimeType: info.mimeType,
        extension: info.extension,
        sizeBytes: String(info.size),
        sha256: info.sha256,
        status: 'ready',
        scanStatus: info.scanStatus ?? 'unscanned',
        expiresAt: new Date(Date.now() + policy.retentionSeconds * 1000),
      })
      if (result.affected !== 1)
        throw new ConflictException('附件状态已变更')
      await this.audit(manager, row.id, row.ownerId, 'uploaded')
    })
    return this.response(await this.row(row.id))
  }

  async abort(id: string): Promise<void> {
    try {
      await this.remove(id, undefined, true, true)
    }
    catch {
      this.logger.error(`上传补偿待重试：${id}`)
    }
  }

  private async row(id: string): Promise<AttachmentEntity> {
    this.assertId(id)
    const row = await this.repository.findOneBy({ id })
    if (!row)
      throw new NotFoundException('附件不存在')
    return row
  }

  private async canRead(manager: EntityManager, row: AttachmentEntity, userId: string): Promise<boolean> {
    const refs = await manager.getRepository(AttachmentReferenceEntity).findBy({ attachmentId: row.id })
    if (!refs.length)
      return row.ownerId === userId
    for (const ref of refs) {
      const handler = this.businesses.get(ref.businessType)
      if (handler && await handler.canRead(manager, ref, userId))
        return true
    }
    return false
  }

  async detail(id: string, uid: string, admin = false) {
    const row = await this.row(id)
    if (!admin && !await this.canRead(this.repository.manager, row, uid))
      throw new ForbiddenException('无附件访问权限')
    return this.response(row)
  }

  async list(query: AttachmentQueryDto) {
    if (query.ownerId)
      this.assertId(query.ownerId)
    if (query.startTime && query.endTime && Date.parse(query.startTime) > Date.parse(query.endTime))
      throw new UnprocessableEntityException('开始时间不能晚于结束时间')
    const qb = this.repository.createQueryBuilder('attachment')
    if (query.name)
      qb.andWhere('attachment.originalName ILIKE :name', { name: `%${query.name.replace(/[\\%_]/g, '\\$&')}%` })
    for (const field of ['purpose', 'extension', 'ownerId', 'status'] as const) {
      if (query[field])
        qb.andWhere(`attachment.${field} = :${field}`, { [field]: query[field] })
    }
    if (query.startTime)
      qb.andWhere('attachment.createdAt >= :start', { start: query.startTime })
    if (query.endTime)
      qb.andWhere('attachment.createdAt <= :end', { end: query.endTime })
    const [rows, total] = await qb.orderBy('attachment.createdAt', 'DESC').addOrderBy('attachment.id', 'DESC').skip((query.page - 1) * query.pageSize).take(query.pageSize).getManyAndCount()
    return { items: rows.map(row => this.response(row)), total }
  }

  async download(id: string, uid: string | null, publicImage = false, admin = false) {
    this.assertId(id)
    let opened: Awaited<ReturnType<LocalUploadStorage['read']>> | undefined
    // Open a file descriptor while holding the same row lock used by delete/bind.
    return this.repository.manager.transaction(async (manager) => {
      const row = await manager.getRepository(AttachmentEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_read' } })
      if (!row || row.status !== 'ready' || row.scanStatus === 'rejected' || row.storageDriver !== 'local'
        || (row.expiresAt && row.expiresAt <= new Date())) {
        throw new NotFoundException('附件不可下载')
      }
      let allowed = false
      if (publicImage && row.visibility === 'public' && row.purpose === 'avatar') {
        const refs = await manager.getRepository(AttachmentReferenceEntity).findBy({ attachmentId: id })
        for (const ref of refs) {
          if (await this.businesses.get(ref.businessType)?.isPublic?.(manager, ref, id))
            allowed = true
        }
      }
      else if (!publicImage && uid) {
        allowed = admin || await this.canRead(manager, row, uid)
      }
      if (!allowed)
        throw new ForbiddenException('无附件下载权限')
      await this.audit(manager, id, uid, publicImage ? 'public-download-authorized' : 'download-authorized')
      const file = await this.storage.read(row.objectKey)
      opened = file
      return { ...file, mimeType: row.mimeType, name: row.originalName }
    }).catch((error) => {
      // A failed commit must not leak the descriptor opened under the row lock.
      opened?.stream.destroy()
      throw error
    })
  }

  /** Call inside a trusted business transaction; locks serialize binding against cleanup. */
  async bind(manager: EntityManager, id: string, uid: string, business: AttachmentBusiness): Promise<void> {
    this.assertId(id)
    const handler = this.businesses.get(business.businessType)
    if (!handler || !await handler.canBind(manager, business, uid))
      throw new ForbiddenException('业务附件绑定未授权')
    const repository = manager.getRepository(AttachmentEntity)
    const row = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
    if (!row || row.ownerId !== uid || row.status !== 'ready' || row.scanStatus === 'rejected'
      || row.purpose !== handler.purpose || (row.expiresAt && row.expiresAt <= new Date())) {
      throw new ConflictException('附件不可绑定到该业务')
    }
    const refs = manager.getRepository(AttachmentReferenceEntity)
    if (!await refs.existsBy({ attachmentId: id, ...business }))
      await refs.save(refs.create({ attachmentId: id, ...business }))
    await repository.update(id, { expiresAt: null })
    await this.audit(manager, id, uid, 'bound')
  }

  async unbind(manager: EntityManager, id: string, uid: string, business: AttachmentBusiness): Promise<void> {
    const handler = this.businesses.get(business.businessType)
    if (!handler || !await handler.canBind(manager, business, uid))
      throw new ForbiddenException('业务附件解绑未授权')
    await this.releaseReference(manager, id, business)
    await this.audit(manager, id, uid, 'unbound')
  }

  private async releaseReference(manager: EntityManager, id: string, business: AttachmentBusiness) {
    const repository = manager.getRepository(AttachmentEntity)
    await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
    const refs = manager.getRepository(AttachmentReferenceEntity)
    await refs.softDelete({ attachmentId: id, ...business })
    if (!await refs.existsBy({ attachmentId: id }))
      await repository.update(id, { expiresAt: new Date() })
  }

  async setAvatar(uid: string, attachmentId: string | null): Promise<boolean> {
    if (attachmentId !== null)
      this.assertId(attachmentId)
    await this.repository.manager.transaction('SERIALIZABLE', async (manager) => {
      const users = manager.getRepository(SysUserEntity)
      const user = await users.findOne({ where: { id: uid, status: 1 }, lock: { mode: 'pessimistic_write' } })
      if (!user)
        throw new NotFoundException('用户不可用')
      const business = { businessType: 'user', businessId: uid, field: 'avatar' }
      const refs = await manager.getRepository(AttachmentReferenceEntity).findBy(business)
      // Sort all attachment locks for deterministic lock ordering.
      const ids = [...new Set([...refs.map(ref => ref.attachmentId), ...(attachmentId ? [attachmentId] : [])])].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)
      for (const id of ids)
        await manager.getRepository(AttachmentEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
      if (attachmentId)
        await this.bind(manager, attachmentId, uid, business)
      for (const ref of refs) {
        if (ref.attachmentId !== attachmentId)
          await this.unbind(manager, ref.attachmentId, uid, business)
      }
      const next = attachmentId ? await manager.getRepository(AttachmentEntity).findOneByOrFail({ id: attachmentId }) : null
      user.avatar = next ? this.url(next.id, next.visibility === 'public') : null
      await users.save(user)
    }).catch((error) => {
      if (['40001', '40P01', '23505'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException('头像或附件发生并发变更，请重试')
      throw error
    })
    await this.cache.delCache(userKeys.info(uid))
    return true
  }

  async remove(id: string, uid?: string, admin = false, abortUpload = false): Promise<boolean> {
    this.assertId(id)
    const row = await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AttachmentEntity)
      const row = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
      if (!row)
        throw new NotFoundException('附件不存在')
      if (!admin && row.ownerId !== uid)
        throw new ForbiddenException('无附件删除权限')
      if (!abortUpload && row.status === 'pending' && row.expiresAt && row.expiresAt > new Date())
        throw new ConflictException('附件仍在上传，请稍后重试')
      if (await manager.getRepository(AttachmentReferenceEntity).existsBy({ attachmentId: id }))
        throw new ConflictException('附件仍被业务引用，不能删除')
      if (row.status !== 'deleted') {
        row.status = 'deleting'
        await repository.save(row)
        await this.audit(manager, id, uid ?? null, 'delete-requested')
      }
      return row
    })
    if (row.status === 'deleted')
      return true
    try {
      if (row.storageDriver !== 'local')
        throw new Error('Unsupported storage driver')
      await this.storage.remove(row.objectKey)
      await this.repository.update({ id, status: 'deleting' }, { status: 'deleted', lastError: null })
    }
    catch {
      await this.repository.update({ id, status: 'deleting' }, { lastError: 'Physical deletion failed; retry scheduled' })
      throw new ConflictException('附件已停止访问，物理删除待重试')
    }
    return true
  }

  async cleanup(): Promise<void> {
    const rows = await this.repository.find({
      where: [{ status: 'deleting' }, { status: 'pending', expiresAt: LessThanOrEqual(new Date()) }, { status: 'ready', expiresAt: LessThanOrEqual(new Date()) }],
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: 100,
    })
    for (const candidate of rows) {
      // Recheck expiry inside the write lock: binding may have cleared it meanwhile.
      const claimed = await this.repository.manager.transaction(async (manager) => {
        const repo = manager.getRepository(AttachmentEntity)
        const current = await repo.findOne({ where: { id: candidate.id }, lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' } })
        if (!current || current.status === 'deleted' || (current.status !== 'deleting' && (!current.expiresAt || current.expiresAt > new Date())))
          return false
        if (await manager.getRepository(AttachmentReferenceEntity).existsBy({ attachmentId: current.id }))
          return false
        await repo.update(current.id, { status: 'deleting' })
        return true
      })
      if (claimed)
        await this.remove(candidate.id, undefined, true).catch(() => this.logger.warn(`附件删除将在下周期重试：${candidate.id}`))
    }
  }

  private async audit(manager: EntityManager, attachmentId: string, actorId: string | null, action: string) {
    const repository = manager.getRepository(AttachmentAuditEntity)
    await repository.save(repository.create({ attachmentId, actorId, action }))
  }
}
