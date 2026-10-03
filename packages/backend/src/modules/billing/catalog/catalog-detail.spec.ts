import type { DataSource } from 'typeorm'
import type { QuotaService } from './quota.service.js'
import { PATH_METADATA } from '@nestjs/common/constants.js'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import { SystemCatalogController } from './catalog.controller.js'
import { CatalogService } from './catalog.service.js'
import { CATALOG_PERMISSIONS } from './catalog.types.js'
import { ChannelProductEntity } from './entities/channel-product.entity.js'
import { PackageVersionEntity, RechargePackageEntity } from './entities/recharge-package.entity.js'

describe('运营套餐详情', () => {
  const id = '9007199254740993'
  const versionId = '9007199254740995'
  const stable = { id, code: 'monthly', currentRevision: 2, status: 'draft' as const }
  const version = { id: versionId, packageId: id, revision: 2, title: '月度套餐', priceMinor: '100', basePoints: '200', giftPoints: '0' }
  const stableRepo = { findOneBy: jest.fn() }
  const versionRepo = { findOneBy: jest.fn() }
  const productRepo = { find: jest.fn() }
  const source = { getRepository: jest.fn((entity) => {
    if (entity === RechargePackageEntity)
      return stableRepo
    if (entity === PackageVersionEntity)
      return versionRepo
    if (entity === ChannelProductEntity)
      return productRepo
    throw new Error('不应查询其他业务表')
  }) }
  const service = new CatalogService(source as unknown as DataSource, {} as QuotaService)

  beforeEach(() => {
    jest.clearAllMocks()
    stableRepo.findOneBy.mockResolvedValue(stable)
    versionRepo.findOneBy.mockResolvedValue(version)
    productRepo.find.mockResolvedValue([])
  })

  it.each(['draft', 'disabled', 'enabled'])('%s 套餐可读取详情，当前版本映射保留大整数 ID', async (status) => {
    stableRepo.findOneBy.mockResolvedValue({ ...stable, status })
    const products = ['apple', 'google'].map(channel => ({ id: `${channel}-mapping`, versionId, channel, applicationId: 'com.example.app', environment: 'sandbox', productId: 'monthly.points' }))
    productRepo.find.mockResolvedValue(products)
    expect(await service.packageDetail(id)).toMatchObject({ id, status, versionId, revision: 2, products })
    expect(stableRepo.findOneBy).toHaveBeenCalledWith({ id, tenantId: '1' })
    expect(versionRepo.findOneBy).toHaveBeenCalledWith({ packageId: id, revision: 2, tenantId: '1' })
    expect(productRepo.find).toHaveBeenCalledWith({ where: { versionId, tenantId: '1' }, order: { id: 'ASC' } })
  })

  it('未配置映射返回空数组，套餐或当前版本不存在则返回404', async () => {
    expect((await service.packageDetail(id)).products).toEqual([])
    stableRepo.findOneBy.mockResolvedValue(null)
    await expect(service.packageDetail(id)).rejects.toMatchObject({ status: 404 })
    stableRepo.findOneBy.mockResolvedValue(stable)
    versionRepo.findOneBy.mockResolvedValue(null)
    await expect(service.packageDetail(id)).rejects.toMatchObject({ status: 404 })
    expect(productRepo.find).toHaveBeenCalledTimes(1)
  })

  it('非法及溢出 ID 在数据库查询前拒绝', async () => {
    for (const invalid of ['0', '-1', '1 OR 1=1', '9223372036854775808'])
      await expect(service.packageDetail(invalid)).rejects.toThrow()
    expect(source.getRepository).not.toHaveBeenCalled()
  })

  it('套餐详情使用既有 catalog:read 权限，列表职责不变', async () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, SystemCatalogController.prototype.packageDetail)).toBe(CATALOG_PERMISSIONS.READ)
    expect(Reflect.getMetadata(PATH_METADATA, SystemCatalogController.prototype.packageDetail)).toBe('packages/:id')
    expect(Reflect.getMetadata(PATH_METADATA, SystemCatalogController.prototype.packages)).toBe('packages')
    const detail = jest.spyOn(service, 'packageDetail').mockResolvedValue({ ...version, ...stable, versionId, products: [], startsAt: null, endsAt: null, totalLimit: null, dailyLimit: null, userTotalLimit: null, userDailyLimit: null })
    await new SystemCatalogController(service).packageDetail({ id })
    expect(detail).toHaveBeenCalledWith(id)
    detail.mockRestore()
  })
})
