import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
let content = (await readFile(new URL('.env.docker.example', root), 'utf8')).replace(/\r\n/g, '\n')
for (const key of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET']) {
  content = content.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${randomBytes(48).toString('base64url')}`)
}

try {
  await writeFile(new URL('.env', root), content, { flag: 'wx', mode: 0o600 })
  console.log('已创建根目录 .env，并生成数据库、Redis 与独立 JWT 密钥。可继续 docker compose build。')
}
catch (error) {
  if (error.code !== 'EEXIST')
    throw error
  console.error('根目录 .env 已存在，未覆盖。请对照 .env.docker.example 补齐 Docker 配置。')
  process.exitCode = 1
}
