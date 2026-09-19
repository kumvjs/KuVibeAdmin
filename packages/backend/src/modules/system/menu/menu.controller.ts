import { Controller, Get } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { VbenRouteRecordDto } from './dto/vben-menu.dto.js'
import { MenuService } from './menu.service.js'

@Controller('menu')
@ApiSecurityAuth()
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('all')
  @ApiOperation({ summary: '获取当前用户的动态菜单' })
  @ApiResult({ type: [VbenRouteRecordDto] })
  async all(@CurrentUser() user: LoginUserContext): Promise<VbenRouteRecordDto[]> {
    return this.menuService.getAllMenusByUserId(user.uid)
  }
}
