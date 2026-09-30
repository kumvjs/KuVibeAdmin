import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const development = process.argv.includes('--dev')
const destination = development ? '.env.docker.dev' : '.env'

// 已有环境升级只补齐 RabbitMQ，保留数据库、JWT 与已设置的消息凭据。
if (process.argv.includes('--rabbitmq')) {
  const path = new URL(destination, root)
  let existing = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n')
  const defaults = {
    RABBITMQ_ENABLED: 'true',
    RABBITMQ_USERNAME: 'ku_vibe_admin',
    RABBITMQ_PASSWORD: randomBytes(48).toString('base64url'),
    RABBITMQ_VHOST: 'kuvibe',
    RABBITMQ_PREFETCH: '5',
    RABBITMQ_QUEUE: 'kuvibe.billing',
    RABBITMQ_IMAGE: 'rabbitmq:4.3.6-management',
    DOCKER_RABBITMQ_MANAGEMENT_PORT: development ? '15673' : '15672',
    ...(development ? { DOCKER_RABBITMQ_PORT: '5673' } : {}),
  }
  let changed = false
  for (const [key, value] of Object.entries(defaults)) {
    if (!new RegExp(`^${key}=`, 'm').test(existing)) {
      existing += `\n${key}=${value}\n`
      changed = true
    }
    else if (key === 'RABBITMQ_PASSWORD' && /^RABBITMQ_PASSWORD=[ \t]*$/m.test(existing)) {
      existing = existing.replace(/^RABBITMQ_PASSWORD=[ \t]*$/m, `RABBITMQ_PASSWORD=${value}`)
      changed = true
    }
  }
  if (changed)
    await writeFile(path, existing, { mode: 0o600 })
  console.log(`${destination} 的 RabbitMQ 配置${changed ? '已补齐' : '已存在'}；已有非空凭据保留。`)
  process.exit(0)
}
let content = (await readFile(new URL('.env.docker.example', root), 'utf8')).replace(/\r\n/g, '\n')
if (development) {
  content = content.replace('NODE_ENV=local', 'NODE_ENV=development')
    .replace('DOCKER_HTTP_PORT=7001', 'DOCKER_HTTP_PORT=17001')
    .replace('APP_BASE_URL=http://localhost:7001', 'APP_BASE_URL=http://localhost:17001')
    .replace('POSTGRES_DB=ku_vibe_admin', 'POSTGRES_DB=kuvibe_admin_dev')
    .replace('DOCKER_RABBITMQ_MANAGEMENT_PORT=15672', 'DOCKER_RABBITMQ_MANAGEMENT_PORT=15673')
  content += '\nDOCKER_POSTGRES_PORT=55432\nDOCKER_REDIS_PORT=56379\n'
  content += 'DOCKER_RABBITMQ_PORT=5673\n'
}
for (const key of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'RABBITMQ_PASSWORD']) {
  content = content.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${randomBytes(48).toString('base64url')}`)
}

try {
  await writeFile(new URL(destination, root), content, { flag: 'wx', mode: 0o600 })
  console.log(`已创建根目录 ${destination}，并生成数据库、Redis、RabbitMQ 与独立 JWT 密钥。`)
}
catch (error) {
  if (error.code !== 'EEXIST')
    throw error
  console.error(`根目录 ${development ? '.env.docker.dev' : '.env'} 已存在，未覆盖。请对照 .env.docker.example 补齐 Docker 配置。`)
  process.exitCode = 1
}
