import type { SysUserEntity } from '#/modules/user/entities/user.entity.js'
import { UnprocessableEntityException } from '@nestjs/common'
import { buildSysUserWriteState, normalizeRoleIds } from './sys-user-write.rules.js'
import { UserStatus } from './sys-user.types.js'

describe('system-user write rules', () => {
  const current = {
    avatar: null,
    deptId: '1',
    description: null,
    homePath: '/workspace',
    name: 'Existing User',
    remark: null,
    status: UserStatus.ENABLED,
    timezone: null,
    username: 'immutable.login',
  } as any

  it('normalizes bigint role IDs and partial nullable fields', () => {
    expect(normalizeRoleIds(['10', '2'])).toEqual(['2', '10'])
    expect(buildSysUserWriteState({ remark: '' }, current)).toMatchObject({
      deptId: '1',
      name: 'Existing User',
      remark: null,
      username: 'immutable.login',
    })
  })

  it('preserves immutable username even if a direct caller injects it', () => {
    expect(buildSysUserWriteState({ username: 'attacker' } as any, current).username)
      .toBe('immutable.login')
  })

  it.each([
    [['0'], 'PostgreSQL bigint'],
    [['9223372036854775808'], 'PostgreSQL bigint'],
    [['1', '1'], '重复'],
    [[], '1 到 100'],
  ])('rejects invalid role assignment %#', (roleIds, message) => {
    expect(() => normalizeRoleIds(roleIds)).toThrow(message)
  })

  it('rejects missing create fields and invalid direct service payloads', () => {
    expect(() => buildSysUserWriteState({} as any)).toThrow(UnprocessableEntityException)
    expect(() => buildSysUserWriteState({ status: true } as any, current)).toThrow('status 必须是 0 或 1')
    expect(() => buildSysUserWriteState({ homePath: 'javascript:alert(1)' } as any, current)).toThrow('homePath')
  })
})

describe('管理员用户写入的时区校验', () => {
  const user = {
    username: 'timezone_user',
    name: '时区用户',
    deptId: '1',
    status: 1,
    timezone: 'Asia/Tokyo',
    homePath: null,
    avatar: null,
  } as SysUserEntity

  it('省略保留偏好，null 恢复跟随设备', () => {
    expect(buildSysUserWriteState({}, user).timezone).toBe('Asia/Tokyo')
    expect(buildSysUserWriteState({ timezone: null }, user).timezone).toBeNull()
  })

  it.each(['GMT+8', '', 'Invalid/Zone'])('拒绝非法时区 %s', (timezone) => {
    expect(() => buildSysUserWriteState({ timezone }, user)).toThrow()
  })
})
