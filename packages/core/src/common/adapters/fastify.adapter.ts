import FastifyCookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import FastifyMultipart from '@fastify/multipart'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '#/app.module.js'
import { UPLOAD_MAX_BYTES } from '#/modules/upload/upload.constants.js'

// eslint-disable-next-line antfu/no-top-level-await
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    trustProxy: true,
    requestTimeout: 120_000,
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
    fileSize: UPLOAD_MAX_BYTES, // Resource ceiling; UploadController applies the database policy per request.
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

  // Superseded temporary files are never part of the system attachment store.
  if (/^\/uploads(?:\/|$)/.test(url))
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
