// import { scanWsGateways } from '@kumvjs/nestjs-swagger-ws'
import { INestApplication, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppConfig, appRegToken } from '#/config/index.js'
import { SwaggerConfig, swaggerRegToken } from '#/config/swagger.config.js'
import { WebsocketModule } from '#/modules/websocket/index.js'

const WS_PATH = 'ws-docs'

export function setupWsSwagger(app: INestApplication, configService: ConfigService) {
  const { name } = configService.get<AppConfig>(appRegToken)!
  const { enable, serverUrl } = configService.get<SwaggerConfig>(swaggerRegToken)!
  if (!enable)
    return

  const { extraModels, paths } = { extraModels: [], paths: {} }// scanWsGateways(app)

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(`${name} — WebSocket`)
      .setDescription('WebSocket 事件文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
    { deepScanRoutes: false, extraModels, include: [WebsocketModule] },
  )

  document.paths = paths

  SwaggerModule.setup(WS_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
    jsonDocumentUrl: `/${WS_PATH}/json`,
  })

  return () => {
    const logger = new Logger('WsSwaggerModule')
    logger.log(`WS Swagger UI:   ${serverUrl}/${WS_PATH}`)
    logger.log(`WS Swagger JSON: ${serverUrl}/${WS_PATH}/json`)
  }
}
