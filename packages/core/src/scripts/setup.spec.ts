import { readFile, writeFile } from 'node:fs/promises'
import { stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parse } from 'dotenv'
import { clearSetupPermissions } from './setup-cache.js'
import { initializeBaseData } from './setup-data.js'

jest.mock('./setup-cache.js', () => ({ clearSetupPermissions: jest.fn() }))
jest.mock('./setup-data.js', () => ({ initializeBaseData: jest.fn() }))

jest.mock('node:fs/promises', () => ({ readFile: jest.fn(), writeFile: jest.fn() }))
jest.mock('node:readline/promises', () => ({ createInterface: jest.fn() }))
jest.mock('../config/database.config.js', () => ({
  __esModule: true,
  default: {},
  dataSourceOptions: { type: 'postgres' },
}))
jest.mock('../modules/user/entities/user.entity.js', () => ({ SysUserEntity: class {} }))
jest.mock('../modules/system/role/entities/role.entity.js', () => ({ SysRoleEntity: class {} }))
jest.mock('../modules/user/entities/user-role.entity.js', () => ({ __esModule: true, default: class {} }))

describe('初始化脚本', () => {
  const originalEnv = { ...process.env }
  const originalExitCode = process.exitCode
  let output: jest.SpyInstance
  let question: jest.Mock
  let close: jest.Mock
  let userRepository: { findOne: jest.Mock, create: jest.Mock, save: jest.Mock }
  let roleRepository: { findOne: jest.Mock, create: jest.Mock, save: jest.Mock }
  let query: Record<string, jest.Mock>
  let database: any
  let completed: Promise<void>

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(initializeBaseData).mockResolvedValue({ rootDeptId: '10', affectedUserIds: ['1'] })
    jest.mocked(clearSetupPermissions).mockResolvedValue(undefined)
    delete process.env.JWT_SECRET
    delete process.env.REFRESH_TOKEN_SECRET
    process.exitCode = 0
    output = jest.spyOn(stdout, 'write').mockReturnValue(true)
    question = jest.fn()
      .mockResolvedValueOnce('admin')
      .mockResolvedValueOnce('secret1')
      .mockResolvedValueOnce('secret1')
    close = jest.fn()
    jest.mocked(createInterface).mockReturnValue({ question, close } as any)
    jest.mocked(readFile).mockResolvedValue('JWT_SECRET="existing-jwt"\nREFRESH_TOKEN_SECRET=existing-refresh\n')
    jest.mocked(writeFile).mockResolvedValue(undefined)
    userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(value => ({ ...value, setPassword: jest.fn().mockResolvedValue(undefined) })),
      save: jest.fn().mockResolvedValue({ id: '1' }),
    }
    roleRepository = {
      findOne: jest.fn().mockResolvedValue({ id: '2', status: 1 }),
      create: jest.fn(value => value),
      save: jest.fn().mockResolvedValue({ id: '2' }),
    }
    query = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }
    const linkRepository = {
      createQueryBuilder: jest.fn(() => query),
      create: jest.fn(value => value),
      save: jest.fn().mockResolvedValue({}),
    }
    const { SysUserEntity } = jest.requireMock('../modules/user/entities/user.entity.js')
    const { SysRoleEntity } = jest.requireMock('../modules/system/role/entities/role.entity.js')
    database = jest.requireMock('../config/database.config.js').default
    Object.assign(database, {
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(entity => entity === SysUserEntity
        ? userRepository
        : entity === SysRoleEntity ? roleRepository : linkRepository),
      transaction: jest.fn(callback => callback(database)),
    })
    completed = new Promise<void>((resolve) => {
      database.destroy = jest.fn(async () => {
        resolve()
      })
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    process.exitCode = originalExitCode
    output.mockRestore()
  })

  async function runSetup() {
    await jest.isolateModulesAsync(async () => {
      await import('./setup.js')
    })
    await completed
    await new Promise(resolve => setImmediate(resolve))
    expect(process.exitCode).toBe(0)
    expect(database.destroy).toHaveBeenCalledTimes(1)
  }

  it('已有超级用户时仍补齐基础数据并清理权限缓存', async () => {
    query.getOne.mockResolvedValue({ user: { username: 'custom-admin' } })
    await runSetup()
    expect(query.where).toHaveBeenCalledWith('role.code = :code', { code: 'super' })
    expect(initializeBaseData).toHaveBeenCalledWith(database)
    expect(clearSetupPermissions).toHaveBeenCalledWith(['1'])
    expect(createInterface).not.toHaveBeenCalled()
    expect(database.transaction).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Super account initialization skipped'))
  })

  it.each([{ status: 0 }, { status: 1, deletedAt: new Date() }])('已有不可用 super 角色时提示结束：%j', async (role) => {
    roleRepository.findOne.mockResolvedValue(role)
    await runSetup()
    expect(createInterface).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('完整保留已配置的密钥且不重写文件', async () => {
    await runSetup()
    expect(userRepository.save).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('缓存清理失败时报告已提交状态并阻止创建账号', async () => {
    jest.mocked(clearSetupPermissions).mockRejectedValueOnce(new Error('unavailable'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await jest.isolateModulesAsync(async () => {
        await import('./setup.js')
      })
      await completed
      await new Promise(resolve => setImmediate(resolve))
      expect(process.exitCode).toBe(1)
      expect(createInterface).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('基础数据已提交，但权限缓存清理失败'))
    }
    finally {
      error.mockRestore()
    }
  })

  it('只填充空密钥并保留另一密钥、注释及 CRLF', async () => {
    jest.mocked(readFile).mockResolvedValue('# settings\r\nJWT_SECRET="keep-me"\r\nexport REFRESH_TOKEN_SECRET=""\r\n')
    await runSetup()
    const content = jest.mocked(writeFile).mock.calls[0][1] as string
    expect(content).toContain('# settings\r\nJWT_SECRET="keep-me"\r\n')
    expect(parse(content).REFRESH_TOKEN_SECRET).toMatch(/^[\w-]{64}$/)
  })

  it('缺失的密钥会追加，进程注入的密钥不会被覆盖', async () => {
    process.env.JWT_SECRET = 'injected-secret'
    jest.mocked(readFile).mockResolvedValue('# settings')
    await runSetup()
    const content = jest.mocked(writeFile).mock.calls[0][1] as string
    expect(parse(content).JWT_SECRET).toBeUndefined()
    expect(parse(content).REFRESH_TOKEN_SECRET).toMatch(/^[\w-]{64}$/)
  })

  it('用户名长度、重名、密码长度和确认失败后可重新输入', async () => {
    question.mockReset()
    for (const answer of ['abcd', 'u'.repeat(101), 'taken1', 'admin', 'short', 'p'.repeat(129), 'secret1', 'different', 'secret2', 'secret2'])
      question.mockResolvedValueOnce(answer)
    userRepository.findOne.mockResolvedValueOnce({ username: 'taken1' }).mockResolvedValue(null)
    await runSetup()
    expect(question).toHaveBeenCalledTimes(10)
    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin', deptId: '10' }))
    expect(userRepository.create.mock.results[0].value.setPassword).toHaveBeenCalledWith('secret2')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
