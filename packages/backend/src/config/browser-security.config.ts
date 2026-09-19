import { ConfigType, registerAs } from '@nestjs/config'

export const browserSecurityRegToken = 'browserSecurity'

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5555',
  'http://127.0.0.1:5555',
  'http://localhost:5999',
  'http://127.0.0.1:5999',
] as const

export type CookieSameSite = 'lax' | 'none' | 'strict'

export interface RefreshCookieConfig {
  domain?: string
  httpOnly: true
  path: string
  sameSite: CookieSameSite
  secure: boolean
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '')
    return fallback
  const normalized = value.toLowerCase()
  if (normalized === 'true')
    return true
  if (normalized === 'false')
    return false
  throw new Error(`Invalid boolean value: ${value}`)
}

function normalizeConfiguredOrigin(value: string): string {
  const url = new URL(value.trim())
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.origin === 'null'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error(`Invalid browser origin: ${value}`)
  }
  return url.origin
}

function publicApiOrigin(value: string | undefined): string | undefined {
  if (!value)
    return undefined
  const origin = new URL(value).origin
  return origin === 'null' ? undefined : origin
}

export function parseAllowedOrigins(
  value: string | undefined,
  environment: string | undefined,
): string[] {
  const configured = value
    ? value.split(',').map(origin => origin.trim()).filter(Boolean)
    : environment === 'production' ? [] : [...DEVELOPMENT_ORIGINS]

  return [...new Set(configured.map(normalizeConfiguredOrigin))]
}

export function buildBrowserSecurityConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  const environment = env.NODE_ENV ?? 'development'
  const allowedOrigins = parseAllowedOrigins(env.APP_CORS_ORIGINS, environment)
  const apiOrigin = publicApiOrigin(env.APP_BASE_URL)
  if (apiOrigin && !allowedOrigins.includes(apiOrigin))
    allowedOrigins.push(apiOrigin)

  const secure = parseBoolean(
    env.AUTH_COOKIE_SECURE,
    environment === 'production',
  )
  const sameSite = (env.AUTH_COOKIE_SAME_SITE ?? 'lax').toLowerCase()
  if (!['lax', 'none', 'strict'].includes(sameSite))
    throw new Error(`Invalid AUTH_COOKIE_SAME_SITE: ${sameSite}`)
  if (sameSite === 'none' && !secure)
    throw new Error('AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true')

  const globalPrefix = (env.GLOBAL_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '')
  const refreshCookie: RefreshCookieConfig = {
    httpOnly: true,
    path: `${globalPrefix ? `/${globalPrefix}` : ''}/auth`,
    sameSite: sameSite as CookieSameSite,
    secure,
  }
  const domain = env.AUTH_COOKIE_DOMAIN?.trim()
  if (domain)
    refreshCookie.domain = domain

  return {
    allowedOrigins,
    refreshCookie,
  }
}

export const BROWSER_SECURITY_CONFIG = registerAs(
  browserSecurityRegToken,
  () => buildBrowserSecurityConfig(),
)

export type BrowserSecurityConfig = ConfigType<typeof BROWSER_SECURITY_CONFIG>
