import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
if (!existsSync(new URL('../.env.docker.dev', import.meta.url))) {
  console.error('请先执行 pnpm docker:init:dev，创建独立开发环境配置。')
  process.exit(1)
}
const args = process.argv.slice(2).filter(arg => arg !== '--')
const result = spawnSync('docker', [
  'compose', '--env-file', '.env.docker.dev', '-p', 'kuvibe-admin-dev',
  '-f', 'compose.yaml', '-f', 'compose.dev.yaml', ...args,
], { cwd: root, stdio: 'inherit' })
if (result.error)
  console.error(result.error.message)
process.exitCode = result.status ?? 1
