import { ConfigType, registerAs } from '@nestjs/config'

export const appRegToken = 'app'

const globalPrefix = process.env.GLOBAL_PREFIX || 'api'
export const APP_CONFIG = registerAs(appRegToken, () => ({
  name: process.env.APP_NAME!,
  port: Number.parseInt(process.env.APP_PORT || '3000'),
  baseUrl: process.env.APP_BASE_URL!,
  globalPrefix,
  locale: process.env.APP_LOCALE || 'zh-CN',
  /** 是否允许多端登录 */
  multiDeviceLogin: true,

  logger: {
    level: process.env.LOGGER_LEVEL,
    maxFiles: Number.parseInt(process.env.LOGGER_MAX_FILES || '5'),
  },
}))

export type AppConfig = ConfigType<typeof APP_CONFIG>

export const RouterWhiteList: string[] = [
  `${globalPrefix ? '/' : ''}${globalPrefix}/auth/captcha/img`,
  `${globalPrefix ? '/' : ''}${globalPrefix}/auth/login`,
]
