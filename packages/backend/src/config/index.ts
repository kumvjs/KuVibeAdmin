import cluster from 'node:cluster'
import { APP_CONFIG } from './app.config.js'
import { BROWSER_SECURITY_CONFIG } from './browser-security.config.js'
import { databaseConfig } from './database.config.js'
import { REDIS_CONFIG } from './redis.config.js'
import { securityConfig } from './security.config.js'
import { SWAGGER_CONFIG } from './swagger.config.js'

export * from './app.config.js'
export * from './browser-security.config.js'
export * from './database.config.js'
export * from './security.config.js'

export const isMainCluster
  = process.env.NODE_APP_INSTANCE && Number.parseInt(process.env.NODE_APP_INSTANCE) === 0
export const isMainProcess = cluster.isPrimary || isMainCluster

export const isDev = process.env.NODE_ENV === 'development'
export const isProd = process.env.NODE_ENV === 'production'

export default {
  APP_CONFIG,
  BROWSER_SECURITY_CONFIG,
  databaseConfig,
  securityConfig,
  REDIS_CONFIG,
  SWAGGER_CONFIG,
}
