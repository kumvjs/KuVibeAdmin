import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { isDev, SecurityConfig, securityConfig } from '#/config/index.js'
import { LogModule } from '../system/log/log.module.js'
import { MenuModule } from '../system/menu/menu.module.js'
import { RoleModule } from '../system/role/role.module.js'
import { UserModule } from '../user/user.module.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { RefreshTokenEntity } from './entities/refresh-token.entity.js'
import { CaptchaService } from './services/captcha.service.js'
import { TokenService } from './services/token.service.js'
import { JwtStrategy } from './strategies/jwt.strategy.js'
import { LocalStrategy } from './strategies/local.strategy.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshTokenEntity]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [],
      useFactory: (securityConfig: SecurityConfig) => {
        const { jwtSecret, jwtExprire }
          = securityConfig

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: `${jwtExprire}s`,
          },
          ignoreExpiration: isDev,
        }
      },
      inject: [securityConfig.KEY],
    }),
    UserModule,
    RoleModule,
    MenuModule,
    LogModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, CaptchaService, LocalStrategy, JwtStrategy],
  exports: [AuthService, JwtModule, TokenService, CaptchaService],
})
export class AuthModule { }
