import cluster from 'node:cluster'
import { existsSync } from 'node:fs'
import path from 'node:path'
import FastifyStatic from '@fastify/static'
import { HttpStatus, Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { useContainer } from 'class-validator'
import { AppModule } from './app.module.js'
import { fastifyApp } from './common/adapters/fastify.adapter.js'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js'
// import { setupAsyncApi } from './common/setup/setup-asyncapi.js'
import { setupSwagger } from './common/setup/setup-swagger.js'
import {
  APP_CONFIG,
  AppConfig,
  BROWSER_SECURITY_CONFIG,
  BrowserSecurityConfig,
  isMainProcess,
} from './config/index.js'
import { LoggerService } from './shared/logger/logger.service.js'

declare const module: any

async function bootstrap() {
  const app = fastifyApp
  const configService = app.get(ConfigService)

  const appConfig = app.get<AppConfig>(
    APP_CONFIG.KEY,
    { strict: false },
  )
  const { port, globalPrefix } = appConfig
  const browserSecurity = app.get<BrowserSecurityConfig>(
    BROWSER_SECURITY_CONFIG.KEY,
    { strict: false },
  )

  // class-validator 的 DTO 类中注入 nest 容器的依赖 (用于自定义验证器)
  useContainer(app.select(AppModule), { fallbackOnErrors: true })

  // 允许跨域
  app.enableCors({
    origin: browserSecurity.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // 明确允许方法
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'], // 按需配置允许的请求头
  })

  app.setGlobalPrefix(globalPrefix)
  // In development this module lives under `src/`; after `nest build` it is
  // emitted under `dist/src/`. Resolve both layouts so Fastify never receives
  // a non-existent static root.
  const staticRootCandidates = [
    path.resolve(import.meta.dirname, '..', 'public'),
    path.resolve(import.meta.dirname, '..', '..', 'public'),
    path.resolve(process.cwd(), 'public'),
  ]
  const staticRoot = staticRootCandidates.find(candidate => existsSync(candidate))
  if (staticRoot) {
    // Nest 12 的 useStaticAssets 将模块命名空间传给 Avvio，导致 ready 无法完成。
    // 显式传入插件函数，保持静态资源注册与端口监听的生命周期正常。
    app.register(FastifyStatic, {
      root: staticRoot,
      allowedPath: pathname => !/^\/?uploads(?:\/|$)/.test(pathname),
    })
  }
  else {
    console.warn(`[BOOT] static assets directory not found; checked: ${staticRootCandidates.join(', ')}`)
  }
  // Starts listening for shutdown hooks
  app.enableShutdownHooks()

  app.useGlobalInterceptors(new LoggingInterceptor())

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // transformOptions: { enableImplicitConversion: true },
      // forbidNonWhitelisted: true, // 禁止 无装饰器验证的数据通过
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      stopAtFirstError: true,
      /* exceptionFactory: (errors) => {
        console.log('exceptionFactory', errors)
        return new UnprocessableEntityException(
          errors.map((e) => {
            const rule = Object.keys(e.constraints!)[0]
            const msg = e.constraints![rule]
            return msg
          })[0],
        )
      }, */
    }),
  )

  // app.useWebSocketAdapter(new RedisIoAdapter(app))

  const printSwaggerLog = setupSwagger(app, configService)
  // const printWsSwaggerLog = setupWsSwagger(app, configService)
  // asyncApi 2.0有bug 暂不实现
  // const printAsyncApiLog = await setupAsyncApi(app, configService)

  // 监听成功后再输出服务地址；Nest 的初始化成功日志不代表端口已经监听。
  await app.listen(port, '0.0.0.0')
  app.useLogger(new LoggerService())
  const url = await app.getUrl()
  const { pid } = process
  const prefix = cluster.isPrimary ? 'P' : 'W'

  if (isMainProcess) {
    printSwaggerLog?.()
    // printWsSwaggerLog?.()
    // printAsyncApiLog?.()

    const logger = new Logger('NestApplication')
    logger.log(`[${prefix + pid}] Server running on ${url}`)
  }
}
try {
  // eslint-disable-next-line antfu/no-top-level-await
  await bootstrap()
}
catch (error) {
  // Top-level await rejections can otherwise look like a silent/incomplete
  // startup when running the generated ESM entrypoint.
  console.error('[BOOT] bootstrap failed', error)
  process.exitCode = 1
}
