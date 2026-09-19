import type { INestApplication } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { AppConfig } from '#/config/index.js'
import { Logger } from '@nestjs/common'
import { AsyncApiDocumentBuilder, AsyncApiModule } from 'nestjs-asyncapi'
import { appRegToken } from '#/config/index.js'

export async function setupAsyncApi(app: INestApplication, configService: ConfigService) {
  const { name, globalPrefix } = configService.get<AppConfig>(appRegToken)!

  const serverUrl = process.env.SWAGGER_SERVER_URL || process.env.APP_BASE_URL || 'http://localhost:7001'
  const serverHost = serverUrl.replace(/^https?:\/\//, '')

  const document = AsyncApiModule.createDocument(app, new AsyncApiDocumentBuilder()
    .setTitle(`${name} WebSocket API`)
    .setVersion('1.0')
    .setDescription('WebSocket 接口文档（Socket.IO）\n\n连接时通过 `auth.token` 传递 JWT Token')
    .addServer('ws', {
      host: serverHost,
      protocol: 'socket.io',
      description: 'WebSocket Server',
    })
    .addBearerAuth()
    .build())

  const path = 'async-api'
  await AsyncApiModule.setup(path, app, document)

  return () => {
    const logger = new Logger('AsyncApiModule')
    logger.log(`AsyncAPI UI: ${serverUrl}/${path}`)
  }
}
