import { ConfigType, registerAs } from '@nestjs/config'

export const securityRegToken = 'security'

export const securityConfig = registerAs(
  securityRegToken,
  () => ({
    jwtSecret: process.env.JWT_SECRET!,
    jwtExprire: Number(process.env.JWT_EXPIRE),
    refreshSecret: process.env.REFRESH_TOKEN_SECRET!,
    refreshExpire: Number(process.env.REFRESH_TOKEN_EXPIRE),
  }),
)

export type SecurityConfig = ConfigType<typeof securityConfig>
