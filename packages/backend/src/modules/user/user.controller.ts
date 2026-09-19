import { Controller, Get } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { UserInfoResponseDto } from './dto/user-info-response.dto.js'
import { UserService } from './user.service.js'

@Controller('user')
@ApiSecurityAuth()
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('info')
  @ApiOperation({ summary: '用户信息' })
  @ApiResult({ type: UserInfoResponseDto })
  async info(@CurrentUser() user: LoginUserContext): Promise<UserInfoResponseDto> {
    return this.userService.info(user.uid)
  }
}
