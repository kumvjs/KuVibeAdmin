import { getMetadataArgsStorage } from 'typeorm'
import { PasswordAlgorithm, UserStatus } from '#/modules/system/sys-user/sys-user.types.js'
import SysUserRoleEntity from './user-role.entity.js'
import { SysUserEntity } from './user.entity.js'

describe('sys user entity', () => {
  it('persists Vben profile fields, numeric status, and versioned Argon2 credentials', () => {
    const storage = getMetadataArgsStorage()
    const columns = storage.columns.filter(column => column.target === SysUserEntity)

    expect(columns.map(column => column.propertyName)).toEqual(expect.arrayContaining([
      'deptId',
      'name',
      'passwordAlgorithm',
      'passwordHash',
      'remark',
      'sessionVersion',
      'status',
      'timezone',
      'username',
    ]))
    expect(columns.find(column => column.propertyName === 'status')?.options)
      .toMatchObject({ default: UserStatus.ENABLED, type: 'smallint' })
    expect(columns.find(column => column.propertyName === 'passwordAlgorithm')?.options)
      .toMatchObject({ default: PasswordAlgorithm.ARGON2ID, name: 'password_algorithm' })
  })

  it('uses active-only username uniqueness and cascading user-role cleanup', () => {
    const storage = getMetadataArgsStorage()
    const username = storage.indices.find(
      index => index.target === SysUserEntity && index.name === 'uq_sys_user_username',
    )
    const userRelation = storage.relations.find(
      relation => relation.target === SysUserRoleEntity && relation.propertyName === 'user',
    )

    expect(username).toMatchObject({ unique: true, where: '"deleted_at" IS NULL' })
    expect(userRelation?.options).toMatchObject({ onDelete: 'CASCADE' })
  })

  it('hashes and verifies passwords only through Argon2id PHC strings', async () => {
    const user = new SysUserEntity()
    await user.setPassword('correct horse battery staple')

    expect(user.passwordAlgorithm).toBe(PasswordAlgorithm.ARGON2ID)
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/)
    await expect(user.verifyPassword('correct horse battery staple')).resolves.toBe(true)
    await expect(user.verifyPassword('wrong password')).resolves.toBe(false)
    expect(user.passwordNeedsRehash()).toBe(false)
  })
})
