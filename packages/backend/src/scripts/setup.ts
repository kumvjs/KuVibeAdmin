import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { EOL } from 'node:os'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { parse } from 'dotenv'
import dataSource, { dataSourceOptions } from '../config/database.config.js'
import { Roles } from '../modules/auth/auth.constant.js'
import { SysRoleEntity } from '../modules/system/role/entities/role.entity.js'
import { RoleStatus } from '../modules/system/role/role.types.js'
import { UserStatus } from '../modules/system/sys-user/sys-user.types.js'
import SysUserRoleEntity from '../modules/user/entities/user-role.entity.js'
import { SysUserEntity } from '../modules/user/entities/user.entity.js'

import { clearSetupPermissions } from './setup-cache.js'
import { initializeBaseData } from './setup-data.js'

const SUPER_ROLE_NAME = 'super'
const SECRET_KEYS = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'] as const

function setEnvValue(content: string, key: string, value: string): string {
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
  const pattern = new RegExp(`^([\\t ]*(?:export[\\t ]+)?${key}[\\t ]*=[\\t ]*).*$`, 'gm')

  if (pattern.test(content)) {
    return content.replace(pattern, (_, prefix: string) => `${prefix}${value}`)
  }

  const separator = content.length > 0 && !content.endsWith('\n') ? lineEnding : ''
  return `${content}${separator}${key}=${value}${lineEnding}`
}

async function writeJwtSecrets(envPath: string): Promise<void> {
  let envContent = await readFile(envPath, 'utf8')
  const values = parse(envContent)
  const generated: string[] = []

  for (const key of SECRET_KEYS) {
    if (values[key]?.trim() || process.env[key]?.trim())
      continue
    envContent = setEnvValue(envContent, key, randomBytes(48).toString('base64url'))
    generated.push(key)
  }

  if (generated.length > 0) {
    await writeFile(envPath, envContent, 'utf8')
    stdout.write(`Generated ${generated.join(', ')} in ${envPath}; existing secrets were preserved.${EOL}`)
  }
  else {
    stdout.write(`JWT secrets are already configured; no changes were made.${EOL}`)
  }
}

async function createSuper(username: string, password: string, rootDeptId: string): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const roleRepository = manager.getRepository(SysRoleEntity)
    const userRepository = manager.getRepository(SysUserEntity)
    const userRoleRepository = manager.getRepository(SysUserRoleEntity)

    const existingUser = await userRepository.findOne({
      where: { username },
      withDeleted: true,
    })
    if (existingUser) {
      throw new Error(`User "${username}" already exists.`)
    }

    let superRole = await roleRepository.findOne({
      where: { code: Roles.SUPER },
      withDeleted: true,
    })

    if (superRole && (superRole.deletedAt || superRole.status !== RoleStatus.ENABLED)) {
      throw new Error('The super role is deleted or disabled. Restore and enable it before initialization.')
    }

    if (!superRole) {
      superRole = await roleRepository.save(roleRepository.create({
        name: SUPER_ROLE_NAME,
        code: Roles.SUPER,
        remark: 'System super',
        status: RoleStatus.ENABLED,
        isDefault: false,
      }))
    }

    const superUser = userRepository.create({
      deptId: rootDeptId,
      name: username,
      username,
      sessionVersion: 1,
      status: UserStatus.ENABLED,
    })
    await superUser.setPassword(password)
    await userRepository.save(superUser)

    await userRoleRepository.save(userRoleRepository.create({
      userId: superUser.id,
      roleId: superRole.id,
    }))
  })
}

async function main(): Promise<void> {
  const environment = process.env.NODE_ENV ?? 'local'
  const envPath = resolve(process.cwd(), `.env.${environment}`)
  await readFile(envPath, 'utf8')

  stdout.write(`Environment: ${environment}${EOL}`)
  stdout.write(`Database type: ${String(dataSourceOptions.type)}${EOL}`)

  try {
    await dataSource.initialize()
    const { rootDeptId, affectedUserIds } = await initializeBaseData(dataSource)
    try {
      await clearSetupPermissions(affectedUserIds)
    }
    catch {
      throw new Error('基础数据已提交，但权限缓存清理失败。请保持服务停止，恢复 Redis 后重新运行 setup。')
    }
    stdout.write(`Base data initialized; default user role has no system management grants.${EOL}`)

    const existingSuper = await dataSource.getRepository(SysUserRoleEntity)
      .createQueryBuilder('userRole')
      .innerJoinAndSelect('userRole.user', 'user')
      .innerJoinAndSelect('userRole.role', 'role')
      .where('role.code = :code', { code: Roles.SUPER })
      .getOne()
    if (existingSuper) {
      stdout.write(`A user with the super role already exists: "${existingSuper.user.username}". Super account initialization skipped; base data completed.${EOL}`)
      return
    }

    const superRole = await dataSource.getRepository(SysRoleEntity).findOne({
      where: { code: Roles.SUPER },
      withDeleted: true,
    })
    if (superRole && (superRole.deletedAt || superRole.status !== RoleStatus.ENABLED)) {
      stdout.write(`The super role is deleted or disabled. Restore and enable it before initialization.${EOL}`)
      return
    }

    await promptForSuper(envPath, rootDeptId)
  }
  finally {
    if (dataSource.isInitialized)
      await dataSource.destroy()
  }
}

async function promptForSuper(envPath: string, rootDeptId: string): Promise<void> {
  let hideInput = false
  const mutedOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!hideInput)
        stdout.write(chunk, encoding)
      callback()
    },
  })
  const readline = createInterface({
    input: stdin,
    output: mutedOutput,
    terminal: true,
  })

  const askPassword = async (prompt: string): Promise<string> => {
    stdout.write(prompt)
    hideInput = true
    try {
      return await readline.question('')
    }
    finally {
      hideInput = false
      stdout.write(EOL)
    }
  }

  try {
    let username: string
    while (true) {
      username = (await readline.question('Super username: ')).trim()
      if (username.length < 5 || username.length > 100) {
        stdout.write(`Super username must contain 5–100 characters.${EOL}`)
        continue
      }
      const existingUser = await dataSource.getRepository(SysUserEntity).findOne({
        where: { username },
        withDeleted: true,
      })
      if (existingUser) {
        stdout.write(`User "${username}" already exists. Choose another username.${EOL}`)
        continue
      }
      break
    }

    let password: string
    while (true) {
      password = await askPassword('Super password: ')
      if (password.length < 6 || password.length > 128) {
        stdout.write(`Super password must contain 6–128 characters.${EOL}`)
        continue
      }
      const confirmation = await askPassword('Confirm password: ')
      if (password !== confirmation) {
        stdout.write(`Passwords do not match. Please enter the password again.${EOL}`)
        continue
      }
      break
    }

    await createSuper(username, password, rootDeptId)
    await writeJwtSecrets(envPath)

    stdout.write(`Framework initialization completed.${EOL}`)
  }
  finally {
    readline.close()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Initialization failed: ${message}`)
  process.exitCode = 1
})
