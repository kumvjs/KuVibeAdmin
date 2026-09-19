import type { Repository } from 'typeorm'
import { ResOp } from '#/common/dto/response.dto.js'
import { CacheService } from '#/shared/cache/cache.service.js'
import { SysUserEntity } from './entities/user.entity.js'
import { UserRoleService } from './user-role/user-role.service.js'
import { UserController } from './user.controller.js'
import { UserService } from './user.service.js'

describe('vben current-user contract', () => {
  const userRepository = {
    findOne: jest.fn(),
  }
  const userRoleService = {
    getUserRoleCodes: jest.fn(),
  }
  const service = new UserService(
    {} as CacheService,
    userRepository as unknown as Repository<SysUserEntity>,
    userRoleService as unknown as UserRoleService,
  )
  const controller = new UserController(service)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('maps the entity to a dedicated Vben DTO without exposing internal fields', async () => {
    userRepository.findOne.mockResolvedValue({
      createdAt: new Date('2026-09-07T00:00:00.000Z'),
      avatar: 'https://cdn.example.test/avatar.png',
      description: 'System administrator',
      homePath: '/workspace',
      id: '9007199254740993',
      name: 'Administrator',
      passwordAlgorithm: 'argon2id',
      passwordHash: 'must-not-leak',
      status: 1,
      username: 'admin',
    })
    userRoleService.getUserRoleCodes.mockResolvedValue(['super'])

    const data = await controller.info({ uid: '9007199254740993' } as LoginUserContext)

    expect(data).toEqual({
      avatar: 'https://cdn.example.test/avatar.png',
      desc: 'System administrator',
      homePath: '/workspace',
      realName: 'Administrator',
      roles: ['super'],
      userId: '9007199254740993',
      username: 'admin',
    })
    expect(data).not.toHaveProperty('id')
    expect(data).not.toHaveProperty('passwordHash')
    expect(data).not.toHaveProperty('passwordAlgorithm')
    expect(ResOp.success(data)).toMatchObject({
      code: 0,
      data: {
        avatar: 'https://cdn.example.test/avatar.png',
        desc: 'System administrator',
        homePath: '/workspace',
        realName: 'Administrator',
        roles: ['super'],
        userId: '9007199254740993',
        username: 'admin',
      },
      success: true,
    })
  })

  it('normalizes nullable persisted profile fields without inventing a route or URL', async () => {
    userRepository.findOne.mockResolvedValue({
      avatar: null,
      description: null,
      homePath: null,
      id: '42',
      name: 'User',
      status: 1,
      username: 'user',
    })
    userRoleService.getUserRoleCodes.mockResolvedValue(['user'])

    await expect(controller.info({ uid: '42' } as LoginUserContext)).resolves.toEqual({
      avatar: '',
      desc: '',
      homePath: '',
      realName: 'User',
      roles: ['user'],
      userId: '42',
      username: 'user',
    })
  })
})
