import type { Repository } from 'typeorm'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { userKeys } from '#/shared/cache/keys/index.js'
import { TimezoneService } from './timezone.service.js'

describe('用户时区偏好服务', () => {
  const users = { findOne: jest.fn(), update: jest.fn() }
  const cache = { delCache: jest.fn() }
  const service = new TimezoneService(users as unknown as Repository<SysUserEntity>, cache as unknown as CacheService)

  beforeEach(() => {
    jest.resetAllMocks()
    users.update.mockResolvedValue({ affected: 1 })
  })

  it('不根据服务器默认值填充空偏好', async () => {
    users.findOne.mockResolvedValue({ id: '42', timezone: null })
    await expect(service.getTimezone('42')).resolves.toBeNull()
    expect(users.findOne).toHaveBeenCalledWith({ select: { id: true, timezone: true }, where: { id: '42', status: 1 } })
  })

  it('只更新当前用户的偏好及审计人，完成后失效用户信息缓存', async () => {
    await expect(service.setTimezone('42', 'Asia/Tokyo')).resolves.toBe(true)
    expect(users.update).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 1, deletedAt: expect.anything() }), { timezone: 'Asia/Tokyo', updatedBy: '42' })
    expect(cache.delCache).toHaveBeenCalledWith(userKeys.info('42'))
    expect(users.update.mock.invocationCallOrder[0]).toBeLessThan(cache.delCache.mock.invocationCallOrder[0])
    await service.setTimezone('42', null)
    expect(users.update).toHaveBeenLastCalledWith(expect.anything(), { timezone: null, updatedBy: '42' })
  })

  it('无论调用入口都拒绝非法值，不写数据库', async () => {
    for (const value of ['GMT+8', '', undefined, 8])
      await expect(service.setTimezone('42', value as string)).rejects.toThrow()
    expect(users.update).not.toHaveBeenCalled()
  })

  it('用户不存在或更新失败时不失效缓存', async () => {
    users.findOne.mockResolvedValue(null)
    await expect(service.getTimezone('42')).rejects.toThrow()
    users.update.mockResolvedValue({ affected: 0 })
    await expect(service.setTimezone('42', null)).rejects.toThrow()
    users.update.mockRejectedValue(new Error('数据库不可用'))
    await expect(service.setTimezone('42', null)).rejects.toThrow('数据库不可用')
    expect(cache.delCache).not.toHaveBeenCalled()
  })
})
