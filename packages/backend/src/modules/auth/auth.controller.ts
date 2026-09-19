import type { FastifyReply, FastifyRequest } from 'fastify'
import type { BrowserSecurityConfig, SecurityConfig } from '#/config/index.js'
import { Body, Controller, Get, Headers, Inject, Post, Req, Res } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { GetIp } from '#/common/decorators/http.decorator.js'
import { Public } from '#/common/decorators/public.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'
import { BROWSER_SECURITY_CONFIG, securityConfig } from '#/config/index.js'
import { AuthService } from './auth.service.js'
import { LoginDto, LoginTokenResponseDto } from './dto/auth.dto.js'
import { CaptchaService } from './services/captcha.service.js'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captchaService: CaptchaService,
    @Inject(securityConfig.KEY) private securityConfig: SecurityConfig,
    @Inject(BROWSER_SECURITY_CONFIG.KEY)
    private browserSecurity: BrowserSecurityConfig,
  ) { }

  @Post('login')
  @Public()
  @ApiOperation({ summary: '登录' })
  @ApiResult({ status: 201, type: LoginTokenResponseDto })
  async login(@Body() dto: LoginDto, @GetIp() ip: string, @Headers('user-agent') ua: string, @Res({ passthrough: true }) res: FastifyReply): Promise<LoginTokenResponseDto> {
    // await this.captchaService.checkImgCaptcha(dto.captchaId, dto.verifyCode)
    const { accessToken, refreshToken } = await this.authService.login(
      dto.username,
      dto.password,
      ip,
      ua,
    )
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  @Post('logout')
  @ApiOperation({ summary: '账户登出' })
  @ApiResult({ status: 201, nullable: true })
  async logout(
    @CurrentUser() user: LoginUserContext,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    try {
      await this.authService.clearLoginStatus(
        user.tokenInfo,
        req.cookies?.refresh_token,
      )
    }
    finally {
      res.clearCookie('refresh_token', this.browserSecurity.refreshCookie)
    }
  }

  @Post('refresh')
  @Public()
  @ApiResult({ status: 201, type: LoginTokenResponseDto })
  @ApiOperation({ summary: '根据refreshToken刷新accessToken' })
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const oldRefreshToken = req.cookies?.refresh_token

    if (!oldRefreshToken) {
      throw new BusinessException(ERROR_CODES.AUTH_REFRESH_TOKEN_MISSING)
    }

    const { accessToken, refreshToken } = await this.authService.refreshToken(oldRefreshToken)

    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  @Get('codes')
  @ApiSecurityAuth()
  @ApiOperation({ summary: '获取用户的权限码' })
  @ApiResult({ type: [String] })
  async codes(@CurrentUser() user: LoginUserContext) {
    return this.authService.getEffectivePermissionsByUserId(user.uid)
  }

  private setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
    reply.cookie('refresh_token', refreshToken, {
      ...this.browserSecurity.refreshCookie,
      maxAge: this.securityConfig.refreshExpire,
    })
  }
}
