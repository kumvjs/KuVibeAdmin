import type { MenuMeta, MenuMetaValue } from '../menu.types.js'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator'
import { MenuStatus, MenuType } from '../menu.types.js'
import { IsVbenMenuMeta } from './is-vben-menu-meta.decorator.js'

export class VbenMenuMetaDto implements MenuMeta {
  [key: string]: MenuMetaValue | undefined

  @ApiPropertyOptional()
  activeIcon?: string

  @ApiPropertyOptional()
  activePath?: string

  @ApiPropertyOptional()
  affixTab?: boolean

  @ApiPropertyOptional()
  affixTabOrder?: number

  @ApiPropertyOptional({ type: [String] })
  authority?: string[]

  @ApiPropertyOptional()
  badge?: string

  @ApiPropertyOptional({ enum: ['dot', 'normal'] })
  badgeType?: 'dot' | 'normal'

  @ApiPropertyOptional()
  badgeVariants?: string

  @ApiPropertyOptional()
  hideChildrenInMenu?: boolean

  @ApiPropertyOptional()
  hideInBreadcrumb?: boolean

  @ApiPropertyOptional()
  hideInMenu?: boolean

  @ApiPropertyOptional()
  hideInTab?: boolean

  @ApiPropertyOptional()
  icon?: string

  @ApiPropertyOptional()
  iframeSrc?: string

  @ApiPropertyOptional()
  keepAlive?: boolean

  @ApiPropertyOptional()
  link?: string

  @ApiPropertyOptional()
  maxNumOfOpenTab?: number

  @ApiPropertyOptional()
  noBasicLayout?: boolean

  @ApiPropertyOptional()
  openInNewWindow?: boolean

  @ApiPropertyOptional()
  order?: number

  @ApiPropertyOptional({ additionalProperties: true, type: 'object' })
  query?: Record<string, MenuMetaValue>

  @ApiPropertyOptional()
  title?: string
}

/** Vben system-menu create/update payload. */
export class VbenMenuWriteDto {
  @ApiPropertyOptional({ description: 'menu/embedded 可用；兼容 Vben 表单顶层字段并归入 meta.activePath' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^\/(?!\/)[^\s?#\\]+$/, { message: 'activePath 必须是以单个 / 开头且不含空白、查询串、片段或反斜杠的路由路径' })
  activePath?: string

  @ApiPropertyOptional({ description: '菜单/按钮权限码；button 必填，使用冒号分段' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z][\w-]*(?::[a-z][\w-]*)+$/i, { message: 'authCode 必须是以冒号分段的权限码' })
  authCode?: string

  @ApiPropertyOptional({ description: '前端组件标识或路径；menu 必填' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^(?!\/\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w@./-]+$/, { message: 'component 必须是安全的前端组件标识或路径' })
  component?: string

  @ApiPropertyOptional({ description: '兼容 Vben 表单字段；meta.link/iframeSrc 是规范存储位置' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'linkSrc 必须是有效的 HTTP(S) URL' })
  linkSrc?: string

  @ApiPropertyOptional({ additionalProperties: true, description: '所有类型均要求非空 title；允许 JSON 安全的扩展字段', type: VbenMenuMetaDto })
  @IsOptional()
  @IsObject()
  @IsVbenMenuMeta()
  meta?: VbenMenuMetaDto

  @ApiProperty({ maxLength: 30, minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^\S+$/, { message: 'name 不得包含空白字符' })
  name: string

  @ApiPropertyOptional({ description: '父菜单 ID；根节点可省略或传 0，button 必须指定父级' })
  @IsOptional()
  @IsString()
  @MaxLength(19)
  @Matches(/^(?:0|[1-9]\d*)$/, { message: 'pid 必须是非负整数 bigint 字符串' })
  pid?: string

  @ApiPropertyOptional({ description: '路由路径；catalog/menu/embedded 必填' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^\/(?!\/)[^\s?#\\]+$/, { message: 'path 必须是以单个 / 开头且不含空白、查询串、片段或反斜杠的路由路径' })
  path?: string

  @ApiPropertyOptional({ description: 'catalog/menu 可用的重定向路径' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^\/(?!\/)[^\s?#\\]+$/, { message: 'redirect 必须是以单个 / 开头且不含空白、查询串、片段或反斜杠的路由路径' })
  redirect?: string

  @ApiProperty({ enum: MenuStatus })
  @IsEnum(MenuStatus)
  status: MenuStatus

  @ApiProperty({ enum: MenuType })
  @IsEnum(MenuType)
  type: MenuType
}

export class VbenMenuResponseDto {
  @ApiPropertyOptional({ description: '兼容 Vben v5.7.0 菜单编辑表单' })
  activePath?: string

  @ApiPropertyOptional()
  authCode?: string

  @ApiPropertyOptional({ type: () => [VbenMenuResponseDto] })
  children?: VbenMenuResponseDto[]

  @ApiPropertyOptional()
  component?: string

  @ApiProperty({ type: String })
  id: string

  @ApiPropertyOptional({ additionalProperties: true, type: VbenMenuMetaDto })
  meta?: VbenMenuMetaDto

  @ApiProperty()
  name: string

  @ApiPropertyOptional({ type: String })
  pid?: string

  @ApiPropertyOptional()
  path?: string

  @ApiPropertyOptional()
  redirect?: string

  @ApiProperty({ enum: MenuStatus })
  status: MenuStatus

  @ApiProperty({ enum: MenuType })
  type: MenuType
}

export class VbenRouteRecordDto {
  @ApiPropertyOptional({ type: () => [VbenRouteRecordDto] })
  children?: VbenRouteRecordDto[]

  @ApiPropertyOptional()
  component?: string

  @ApiPropertyOptional({ additionalProperties: true, type: VbenMenuMetaDto })
  meta?: VbenMenuMetaDto

  @ApiProperty()
  name: string

  @ApiProperty()
  path: string

  @ApiPropertyOptional()
  redirect?: string
}
