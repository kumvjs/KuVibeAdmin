import { ConfigType, registerAs } from '@nestjs/config'

export const swaggerRegToken = 'swagger'

export const SWAGGER_CONFIG = registerAs(swaggerRegToken, () => ({
  enable: process.env.SWAGGER_ENABLE === 'true',
  path: process.env.SWAGGER_PATH!,
  serverUrl: process.env.SWAGGER_SERVER_URL || process.env.APP_BASE_URL,
}))

export type SwaggerConfig = ConfigType<typeof SWAGGER_CONFIG>
