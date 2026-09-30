import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const development = process.argv.includes('--dev')
let content = (await readFile(new URL('.env.docker.example', root), 'utf8')).replace(/\r\n/g, '\n')
if (development) {
  content = content.replace('NODE_ENV=local', 'NODE_ENV=development')
    .replace('DOCKER_HTTP_PORT=7001', 'DOCKER_HTTP_PORT=17001')
    .replace('APP_BASE_URL=http://localhost:7001', 'APP_BASE_URL=http://localhost:17001')
    .replace('POSTGRES_DB=ku_vibe_admin', 'POSTGRES_DB=kuvibe_admin_dev')
  content += '\nDOCKER_POSTGRES_PORT=55432\nDOCKER_REDIS_PORT=56379\n'
}
for (const key of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET']) {
  content = content.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${randomBytes(48).toString('base64url')}`)
}

try {
  const destination = development ? '.env.docker.dev' : '.env'
  await writeFile(new URL(destination, root), content, { flag: 'wx', mode: 0o600 })
  console.log(`已创建根目录 ${destination}，并生成数据库、Redis 与独立 JWT 密钥。`)
}
catch (error) {
  if (error.code !== 'EEXIST')
    throw error
  console.error(`根目录 ${development ? '.env.docker.dev' : '.env'} 已存在，未覆盖。请对照 .env.docker.example 补齐 Docker 配置。`)
  process.exitCode = 1
}
