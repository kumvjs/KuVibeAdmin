import {
  buildBrowserSecurityConfig,
  parseAllowedOrigins,
} from './browser-security.config.js'
import { envValidationSchema } from './env.validation.js'

const validEnvironment = {
  JWT_SECRET: 'test-jwt-secret',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: 6379,
  TYPEORM_DATABASE: 'nest_ai_boot',
  TYPEORM_HOST: '127.0.0.1',
  TYPEORM_PASSWORD: 'password',
  TYPEORM_PORT: 5432,
  TYPEORM_TYPE: 'postgres',
  TYPEORM_USERNAME: 'nest_ai_boot',
}

describe('browser security configuration', () => {
  it('uses credential-compatible Vben origins and a host-only local cookie', () => {
    const config = buildBrowserSecurityConfig({
      APP_BASE_URL: 'http://localhost:7001',
      GLOBAL_PREFIX: 'api',
      NODE_ENV: 'local',
    })

    expect(config.allowedOrigins).toEqual(expect.arrayContaining([
      'http://localhost:5555',
      'http://localhost:5999',
      'http://localhost:7001',
    ]))
    expect(config.refreshCookie).toEqual({
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: false,
    })
  })

  it('supports an explicit cross-site production cookie over HTTPS', () => {
    const config = buildBrowserSecurityConfig({
      APP_BASE_URL: 'https://api.example.com',
      APP_CORS_ORIGINS: 'https://admin.example.net',
      AUTH_COOKIE_DOMAIN: 'api.example.com',
      AUTH_COOKIE_SAME_SITE: 'none',
      AUTH_COOKIE_SECURE: 'true',
      NODE_ENV: 'production',
    })

    expect(config.allowedOrigins).toEqual([
      'https://admin.example.net',
      'https://api.example.com',
    ])
    expect(config.refreshCookie).toEqual({
      domain: 'api.example.com',
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'none',
      secure: true,
    })
  })

  it('rejects wildcard/path origins and SameSite=None without Secure', () => {
    expect(() => parseAllowedOrigins('*', 'production')).toThrow()
    expect(() => parseAllowedOrigins('https://admin.example.com/path', 'production')).toThrow()
    expect(() => buildBrowserSecurityConfig({
      AUTH_COOKIE_SAME_SITE: 'none',
      AUTH_COOKIE_SECURE: 'false',
      NODE_ENV: 'local',
    })).toThrow('requires AUTH_COOKIE_SECURE=true')
  })

  it('requires HTTPS browser endpoints and Secure cookies in production', () => {
    const invalid = envValidationSchema.validate({
      ...validEnvironment,
      APP_BASE_URL: 'http://api.example.com',
      APP_CORS_ORIGINS: 'http://admin.example.com',
      AUTH_COOKIE_SECURE: false,
      NODE_ENV: 'production',
    })
    const valid = envValidationSchema.validate({
      ...validEnvironment,
      APP_BASE_URL: 'https://api.example.com',
      APP_CORS_ORIGINS: 'https://admin.example.com',
      AUTH_COOKIE_SECURE: true,
      NODE_ENV: 'production',
    })

    expect(invalid.error).toBeDefined()
    expect(valid.error).toBeUndefined()
  })
})
