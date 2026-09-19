import Joi from 'joi'
import { parseAllowedOrigins } from './browser-security.config.js'

/**
 * Database type.
 */
export const DATABASE_TYPES = [
  'aurora-mysql',
  'aurora-postgres',
  'better-sqlite3',
  'capacitor',
  'cockroachdb',
  'cordova',
  'expo',
  'mariadb',
  'mongodb',
  'mssql',
  'mysql',
  'nativescript',
  'oracle',
  'postgres',
  'react-native',
  'sap',
  'spanner',
  'sqljs',
] as const
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'local', 'test')
    .default('development'),

  APP_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  APP_CORS_ORIGINS: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  AUTH_COOKIE_SECURE: Joi.boolean().optional(),
  AUTH_COOKIE_SAME_SITE: Joi.string()
    .valid('lax', 'none', 'strict')
    .default('lax'),
  AUTH_COOKIE_DOMAIN: Joi.string().hostname().optional(),

  JWT_SECRET: Joi.string().required(),

  PASSWORD_ARGON2_HASH_LENGTH: Joi.number().integer().min(32).default(32),
  PASSWORD_ARGON2_MEMORY_COST: Joi.number().integer().min(19_456).default(19_456),
  PASSWORD_ARGON2_PARALLELISM: Joi.number().integer().min(1).default(1),
  PASSWORD_ARGON2_TIME_COST: Joi.number().integer().min(2).default(2),

  TYPEORM_TYPE: Joi.string().valid(...DATABASE_TYPES).required(),
  TYPEORM_HOST: Joi.string().required(),
  TYPEORM_PORT: Joi.number().required(),
  TYPEORM_USERNAME: Joi.string().required(),
  TYPEORM_PASSWORD: Joi.string().required(),
  TYPEORM_DATABASE: Joi.string().required(),
  TYPEORM_SCHEMA: Joi.string().empty('').optional(),
  TYPEORM_SYNCHRONIZE: Joi.boolean().default(false),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),

  LOGGER_LOG_LEVELS: Joi.string().empty('').custom((value, helpers) => {
    const levels = value
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)

    const allowed = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal']

    for (const level of levels) {
      if (!allowed.includes(level)) {
        return helpers.error('any.invalid')
      }
    }

    return levels
  }).optional(),
  LOGGER_TIMESTAMP: Joi.boolean().empty('').optional(),
  LOGGER_PREFIX: Joi.string().allow('').optional(),
  LOGGER_JSON: Joi.boolean().empty('').optional(),
  LOGGER_COLORS: Joi.boolean().empty('').optional(),
  LOGGER_COMPACT: Joi.boolean().empty('').optional(),
  LOGGER_DEPTH: Joi.number().empty('').optional(),
}).custom((env, helpers) => {
  let allowedOrigins: string[]
  try {
    allowedOrigins = parseAllowedOrigins(env.APP_CORS_ORIGINS, env.NODE_ENV)
  }
  catch {
    return helpers.error('any.invalid')
  }

  const cookieSecure = env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production'
  if (env.AUTH_COOKIE_SAME_SITE === 'none' && !cookieSecure)
    return helpers.error('any.invalid')

  if (env.NODE_ENV === 'production') {
    if (!env.APP_BASE_URL?.startsWith('https://'))
      return helpers.error('any.invalid')
    if (!cookieSecure)
      return helpers.error('any.invalid')
    if (allowedOrigins.some(origin => !origin.startsWith('https://')))
      return helpers.error('any.invalid')
  }

  return env
})
