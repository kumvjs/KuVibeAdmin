import { Redis } from 'ioredis'
import { clearSetupPermissions } from './setup-cache.js'

jest.mock('ioredis', () => ({ Redis: jest.fn() }))

describe('初始化权限缓存清理', () => {
  const client = { connect: jest.fn(), del: jest.fn(), disconnect: jest.fn() }
  beforeEach(() => {
    jest.clearAllMocks()
    client.connect.mockResolvedValue(undefined)
    client.del.mockResolvedValue(1)
    jest.mocked(Redis).mockImplementation(() => client as any)
  })

  it('无关联用户时不连接 Redis', async () => {
    await clearSetupPermissions([])
    expect(Redis).not.toHaveBeenCalled()
  })

  it('只清理受影响用户权限，不清理令牌或整个缓存库', async () => {
    await clearSetupPermissions(['1', '9007199254740993'])
    expect(client.del).toHaveBeenCalledWith('auth:user:permissions:1', 'auth:user:permissions:9007199254740993')
    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })

  it('清理失败传播错误并关闭连接，可由 setup 重试', async () => {
    client.del.mockRejectedValueOnce(new Error('redis unavailable'))
    await expect(clearSetupPermissions(['1'])).rejects.toThrow('redis unavailable')
    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })
})
