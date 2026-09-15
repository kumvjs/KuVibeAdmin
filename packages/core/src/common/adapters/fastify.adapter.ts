import FastifyCookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import FastifyMultipart from '@fastify/multipart'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '#/app.module.js'

// eslint-disable-next-line antfu/no-top-level-await
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    trustProxy: true,
    logger: {
      level: 'info',
    },

    disableRequestLogging: true,
  }),
  {
    bufferLogs: false,
    snapshot: true,
    // forceCloseConnections: true,
  },
)
export { app as fastifyApp }

// api @fastify/helmet
// Fastify v5 plugin type definitions use a narrower raw-server generic than
// Nest's adapter; runtime compatibility is unchanged.
app.register(helmet)

app.register(FastifyMultipart, {
  limits: {
    fields: 10, // Max number of non-file fields
    fileSize: 1024 * 1024 * 6, // limit size 6M
    files: 5, // Max number of file fields
  },
})

app.register(FastifyCookie, {
  secret: 'cookie-secret', // 这个 secret 不太重要，不存鉴权相关，无关紧要
})

// Access Fastify's native instance through Nest's HTTP adapter.  The
// `NestFastifyApplication` interface exposes `getHttpAdapter()`, while
// `getInstance()` belongs to the adapter itself (not the Nest application).
app.getHttpAdapter().getInstance().addHook('onRequest', (request, reply, done) => {
  // forbidden php

  const { url } = request

  // Playground uploads are temporary development artifacts. Even if a
  // deployment accidentally reuses that directory, never expose it in production.
  if (process.env.NODE_ENV === 'production' && /^\/uploads(?:\/|$)/.test(url))
    return reply.code(404).send()

  if (url.endsWith('.php')) {
    reply.raw.statusMessage
      = 'Eh. PHP is not support on this machine. Yep, I also think PHP is bestest programming language. But for me it is beyond my reach.'

    return reply.code(418).send()
  }

  // skip favicon request
  if (/favicon.ico$/.test(url) || /manifest.json$/.test(url))
    return reply.code(204).send()

  done()
})
