// 使用生产环境也公开的只读接口，不依赖 Swagger 或 Playground。
const prefix = (process.env.GLOBAL_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '')
const endpoint = `http://127.0.0.1:${process.env.APP_PORT ?? '7001'}/${prefix ? `${prefix}/` : ''}timezone/getTimezoneOptions`

try {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
  if (!response.ok || (await response.json()).success !== true)
    process.exitCode = 1
}
catch {
  process.exitCode = 1
}
