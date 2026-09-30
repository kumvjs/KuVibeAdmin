import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createConnection, createServer } from 'node:net'
import { DataSource } from 'typeorm'

async function main() {
  if (process.env.NODE_ENV !== 'development' || process.env.TYPEORM_HOST !== 'postgres' || process.env.REDIS_HOST !== 'redis')
    throw new Error('仅允许Compose开发容器执行，禁止生产或未知数据库目标')
  const mode = process.argv[2] ?? 'regression'
  if (!['regression', 'scale-init', 'scale'].includes(mode))
    throw new Error('未知开发验证模式')
  const sockets = new Set()
  const proxy = async (target, port, localPort) => {
    const server = createServer((client) => {
      const upstream = createConnection({ host: target, port })
      for (const socket of [client, upstream]) {
        sockets.add(socket)
        socket.on('error', () => {
          client.destroy()
          upstream.destroy()
        })
        socket.on('close', () => sockets.delete(socket))
      }
      client.pipe(upstream).pipe(client)
    })
    server.listen(localPort, '127.0.0.1')
    await once(server, 'listening')
    return server
  }
  const postgres = await proxy('postgres', 5432, 55433)
  const redis = await proxy('redis', 6379, 56380)
  const databaseUrl = (name) => {
    const url = new URL(`postgresql://127.0.0.1:55433/${name}`)
    url.username = process.env.TYPEORM_USERNAME
    url.password = process.env.TYPEORM_PASSWORD
    return url.href
  }
  const redisUrl = new URL('redis://127.0.0.1:56380/6')
  redisUrl.password = process.env.REDIS_PASSWORD
  try {
    const admin = await new DataSource({ type: 'postgres', url: databaseUrl('postgres') }).initialize()
    try {
      for (const name of mode === 'regression' ? ['m8_test', 'm6_test', 'm71_test'] : ['kuvibe_billing_scale']) {
        if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).length)
          await admin.query(`CREATE DATABASE "${name}"`)
      }
    }
    finally {
      await admin.destroy()
    }
    if (mode === 'scale-init') {
      const scale = await new DataSource({ type: 'postgres', url: databaseUrl('kuvibe_billing_scale'), entities: ['dist/src/**/*.entity.js'], migrations: ['dist/src/migrations/*.js'], synchronize: false }).initialize()
      try {
        await scale.runMigrations()
        console.log('独立多实例账务测试库已就绪。')
      }
      finally {
        await scale.destroy()
      }
      return
    }
    const apiProxies = mode === 'scale' ? [await proxy('billing-api-1', 7001, 17002), await proxy('billing-api-2', 7001, 17003)] : []
    const env = { ...process.env, RELEASE_TEST_DATABASE_URL: databaseUrl('m8_test'), RELEASE_TEST_REDIS_URL: redisUrl.href, UPLOAD_TEST_DATABASE_URL: databaseUrl('m71_test'), UPLOAD_TEST_REDIS_URL: redisUrl.href, TIMEZONE_TEST_DATABASE_URL: databaseUrl('m6_test') }
    if (mode === 'scale') {
      Object.assign(env, { POINTS_TEST_DATABASE: 'kuvibe_billing_scale', TYPEORM_HOST: '127.0.0.1', TYPEORM_PORT: '55433' })
    }
    try {
      for (const file of mode === 'scale' ? ['test/billing-scale.integration.mjs'] : ['test/database-config.test.mjs', 'test/timezone.integration.mjs', 'test/upload.integration.mjs', 'test/release.integration.mjs']) {
        console.log(`验证 ${file}`)
        const child = spawn(process.execPath, [file], { stdio: 'inherit', env })
        const [status] = await once(child, 'exit')
        if (status !== 0)
          throw new Error(`集成验证失败：${file}`)
      }
    }
    finally {
      for (const socket of sockets) socket.destroy()
      await Promise.all(apiProxies.map(server => new Promise(resolve => server.close(resolve))))
    }
  }
  finally {
    for (const socket of sockets) socket.destroy()
    await Promise.all([postgres, redis].map(server => new Promise(resolve => server.close(resolve))))
  }
}
void main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
