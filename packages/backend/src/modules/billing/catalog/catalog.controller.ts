import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'
import { ApiSecurityAuth } from '#/common/decorators/swagger.decorator.js'
import { RequirePermissions } from '#/modules/auth/decorators/index.js'
import { CatalogService } from './catalog.service.js'
import { CATALOG_PERMISSIONS } from './catalog.types.js'
import { BillingIdDto, CatalogListQueryDto, ChannelProductResponseDto, ChannelProductWriteDto, CouponCreateDto, CouponResponseDto, PackageCreateDto, PackagePageDto, PackageResponseDto, PackageVersionWriteDto, PromotionCreateDto, PromotionPageDto, PromotionResponseDto, PromotionVersionWriteDto, PublishStatusDto, QuoteQueryDto, QuoteResponseDto } from './dto/catalog.dto.js'

@Controller('recharge/packages')
@ApiTags('充值套餐')
@ApiSecurityAuth()
export class RechargeCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: '查询已发布且处于销售期的套餐' })
  @ApiResult({ type: PackagePageDto })
  list(@Query() query: CatalogListQueryDto) {
    return this.catalog.packages(query, true)
  }

  @Get(':id/quote')
  @ApiOperation({ summary: '本人报价预览，不锁定库存、预算或首单资格' })
  @ApiResult({ type: QuoteResponseDto })
  quote(@Param() params: BillingIdDto, @Query() query: QuoteQueryDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.quote(params.id, query, user.uid)
  }

  @Get('versions/:id/products')
  @ApiOperation({ summary: '查询套餐版本的内购商品映射，客户端按商店环境选择' })
  @ApiResult({ type: [ChannelProductResponseDto] })
  products(@Param() params: BillingIdDto) {
    return this.catalog.products(params.id)
  }
}

@Controller('system/billing')
@ApiTags('充值运营管理')
@ApiSecurityAuth()
export class SystemCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('packages')
  @RequirePermissions(CATALOG_PERMISSIONS.READ)
  @ApiOperation({ summary: '分页查看套餐及当前版本' })
  @ApiResult({ type: PackagePageDto })
  packages(@Query() query: CatalogListQueryDto) {
    return this.catalog.packages(query)
  }

  @Post('packages')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '创建套餐草稿及第一版本' })
  @ApiResult({ type: PackageResponseDto })
  createPackage(@Body() dto: PackageCreateDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.createPackage(dto, user.uid)
  }

  @Post('packages/:id/versions')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '新增套餐版本，保留旧权益和已售额度' })
  @ApiResult({ type: PackageResponseDto })
  revisePackage(@Param() params: BillingIdDto, @Body() dto: PackageVersionWriteDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.revisePackage(params.id, dto, user.uid)
  }

  @Post('packages/:id/status')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.PUBLISH)
  @ApiOperation({ summary: '发布或下架套餐' })
  @ApiResult({ type: PackageResponseDto })
  publishPackage(@Param() params: BillingIdDto, @Body() dto: PublishStatusDto) {
    return this.catalog.publishPackage(params.id, dto.status)
  }

  @Post('products')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '建立固定内购SKU权益，不能覆写旧SKU' })
  @ApiResult({ type: ChannelProductResponseDto })
  mapProduct(@Body() dto: ChannelProductWriteDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.mapProduct(dto, user.uid)
  }

  @Get('promotions')
  @RequirePermissions(CATALOG_PERMISSIONS.PROMOTION_READ)
  @ApiOperation({ summary: '分页查看优惠活动及当前版本' })
  @ApiResult({ type: PromotionPageDto })
  promotions(@Query() query: CatalogListQueryDto) {
    return this.catalog.promotions(query)
  }

  @Post('promotions')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.PROMOTION_WRITE)
  @ApiOperation({ summary: '创建优惠草稿，首单仅支持结算赠分' })
  @ApiResult({ type: PromotionResponseDto })
  createPromotion(@Body() dto: PromotionCreateDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.createPromotion(dto, user.uid)
  }

  @Post('promotions/:id/versions')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.PROMOTION_WRITE)
  @ApiOperation({ summary: '创建优惠新版本，已发券绑定原版本' })
  @ApiResult({ type: PromotionResponseDto })
  revisePromotion(@Param() params: BillingIdDto, @Body() dto: PromotionVersionWriteDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.revisePromotion(params.id, dto, user.uid)
  }

  @Post('promotions/:id/status')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.PROMOTION_PUBLISH)
  @ApiOperation({ summary: '发布或停用优惠活动' })
  @ApiResult({ type: PromotionResponseDto })
  publishPromotion(@Param() params: BillingIdDto, @Body() dto: PublishStatusDto) {
    return this.catalog.publishPromotion(params.id, dto.status)
  }

  @Post('coupons')
  @HttpCode(200)
  @RequirePermissions(CATALOG_PERMISSIONS.PROMOTION_WRITE)
  @ApiOperation({ summary: '发放绑定活动版本的券码，仅存摘要' })
  @ApiResult({ type: CouponResponseDto })
  createCoupon(@Body() dto: CouponCreateDto, @CurrentUser() user: LoginUserContext) {
    return this.catalog.createCoupon(dto, user.uid)
  }
}
