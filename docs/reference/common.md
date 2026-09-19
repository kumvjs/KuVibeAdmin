# 内置公共能力

`packages/backend/src/common` 提供控制器、DTO 与基础设施共用的装饰器、管道（Pipe）、响应模型和异常处理。本页示例在 `packages/backend` 内使用，导入沿用 `#/` 别名和 ESM `.js` 后缀。

## 能力索引

以下路径均相对于 `packages/backend/src/common/`。

| 目录 | 内置能力 | 用途 |
| --- | --- | --- |
| `decorators/` | `Public`、`CurrentUser`、`GetIp` | 公开接口、登录上下文和客户端 IP |
| `decorators/` | `ApiResult`、`ApiSecurityAuth`、`ApiPaginateQuery` | Swagger 响应、认证与查询参数描述 |
| `decorators/` | `SkipResponseTransform` | 跳过方法的统一成功响应封装 |
| `decorators/class-validator/` | `IsBigIntString` | 校验整数字符串 |
| `pipes/` | `DiscriminatedBodyPipe` | 按请求内容选择 DTO 校验 |
| `dto/` | `PageQueryDto`、`CommonEntityIdDto`、`ResOp` 等 | 分页、ID 与响应基础模型 |
| `exceptions/`、`filters/` | `BusinessException`、`CatchEverythingFilter` | 业务异常与统一错误响应 |
| `interceptors/`、`middleware/` | `TransformInterceptor`、`LoggingInterceptor`、`TraceMiddleware` | 响应封装、日志和请求追踪 |
| `entity/`、`constants/` | `CommonEntity`、错误码、缓存及响应常量 | 持久化基础字段与共享约定 |
| `adapters/`、`setup/` | Fastify 应用、Swagger 与 WebSocket 文档初始化 | 应用启动接线 |

## 请求与认证装饰器

### Public：公开接口

从 `#/common/decorators/public.decorator.js` 导入 `Public`，可标在控制器类或方法上。JWT Guard 在缺少 Token 或 Passport 认证抛错时允许公开请求继续，认证成功后仍会校验用户会话状态；RBAC Guard 跳过权限检查。它不会跳过来源检查、DTO 校验或响应封装；公开接口也不能假设一定存在登录用户。

```ts
import { Controller, Get } from '@nestjs/common'
import { Public } from '#/common/decorators/public.decorator.js'

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' }
  }
}
```

### CurrentUser：读取登录上下文

从 `#/common/decorators/current-user.decorator.js` 导入。`@CurrentUser()` 返回 HTTP `request.user`，不查询数据库；没有用户时返回 `undefined`。当前认证实现注入的是全局类型 `LoginUserContext`，业务代码通常读取 `user.uid`。

```ts
import { Controller, Get } from '@nestjs/common'
import { CurrentUser } from '#/common/decorators/current-user.decorator.js'

@Controller('session')
export class SessionController {
  @Get()
  info(@CurrentUser() user: LoginUserContext) {
    return { userId: user.uid }
  }
}
```

装饰器也支持传字段名，但当前参数类型仍声明为 `keyof SysUserEntity`，与实际登录上下文并不完全一致。读取 `uid` 时采用上面的完整上下文写法。不要直接把整个登录上下文作为公开响应。WebSocket 处理器从 `client.user` 取用户，见 [WebSocket 模块](/modules/websocket)。

### GetIp：客户端 IP

从 `#/common/decorators/http.decorator.js` 导入，在 HTTP 参数上使用 `@GetIp() ip: string | undefined`。提取顺序为 Fastify `request.ip`、`x-forwarded-for` 首项、`x-real-ip`、连接地址，并去掉 IPv4 映射地址的 `::ffff:` 前缀。当前适配器配置了 `trustProxy: true`，IP 的可信程度取决于部署代理与请求头控制。

## Swagger 装饰器

### ApiResult：描述统一响应

从 `#/common/decorators/api-result.decorator.js` 导入。它生成 `ResOp` 包裹的 HTTP 200 响应 Schema；运行时封装由 `TransformInterceptor` 完成，控制器直接返回业务数据即可。

| 写法 | 统一响应内的 `data` |
| --- | --- |
| `@ApiResult({ type: DetailDto })` | 单个 DTO |
| `@ApiResult({ type: [DetailDto] })` | DTO 数组 |
| `@ApiResult({ type: Boolean })` | boolean；也支持 `String`、`Number` |
| `@ApiResult()` | 未指定结构的 object |
| `@ApiResult({ type: DetailDto, isPage: true })` | `{ data: DetailDto[], total: number }` |

可以传 `description` 设置响应说明。此装饰器不改变实际 HTTP 状态；例如 POST 若需要 HTTP 200，须另加 `@HttpCode(200)`。

::: tip 分页结构须与实际返回一致
`isPage: true` 描述的是外层 `data` 中再包含 `{ data, total }`。Vben 系统列表使用 `{ items, total }`，应建立专用分页响应 DTO，并用 `@ApiResult({ type: XxxPageResponseDto })`。装饰器不会重命名返回字段。
:::

### ApiSecurityAuth：标记 Bearer 认证

从 `#/common/decorators/swagger.decorator.js` 导入 `ApiSecurityAuth`，可用于控制器或方法。它相当于 `@ApiSecurity('auth')`，与 `setupSwagger` 注册的认证方案对应。它只描述文档，实际认证与授权由 Guard 执行；权限装饰器见 [认证与 RBAC](/modules/auth-rbac)。

### ApiPaginateQuery：描述分页查询

从 `#/common/decorators/api-paginate-query.decorator.js` 导入。`@ApiPaginateQuery()` 描述 `page`、`limit`、`sortBy`、`searchBy`、`search`、`filter`、`select`、`path`，其中排序格式为 `field:ASC|DESC`，过滤格式为 `filter[field]=value`。

它只增加 Swagger 查询参数，不解析、校验或执行数据库分页。它使用 `limit`（示例 20），而 `PageQueryDto` 使用 `pageSize`（默认 10），两者不能直接视为同一契约。按实际查询 DTO 选择文档写法。

## 校验装饰器与 DTO

### IsBigIntString：整数字符串

```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsBigIntString } from '#/common/decorators/class-validator/is-big-int-string.decorator.js'

export class RecordIdDto {
  @ApiProperty({ type: String, example: '9007199254740993' })
  @IsBigIntString({ message: 'id 必须是整数字符串' })
  id!: string
}
```

该装饰器组合 `IsString` 与正则 `/^-?\d+$/`，支持 `ValidationOptions`（如 `message`、`each`、`groups`）。它允许负数、零和前导零，不检查 PostgreSQL bigint 范围或业务上是否为正数；这些限制须在专用 DTO 中补充。JSON 边界始终传字符串，避免先转为 JavaScript number 丢失精度。

`CommonEntityIdDto`（`dto/common-entity-id.dto.ts`）是可继承的抽象 ID DTO，包含 Swagger 描述、`@Type(() => String)` 和 `@IsBigIntString()`；字符串转换不能恢复已经丢失的数字精度。

### PageQueryDto：基础分页参数

从 `#/common/dto/page-query.dto.js` 导入 `PageQueryDto` 和 `Order`，可直接用于 `@Query() query: PageQueryDto`，或继承后增加带校验装饰器的业务筛选字段。

| 字段 | 当前转换与校验 |
| --- | --- |
| `page` | 默认 1；使用 `parseInt` 转换，要求整数且至少为 1 |
| `pageSize` | 默认 10；使用 `parseInt` 转换并截断到最大 100，要求至少为 1 |
| `order` | 可选；传入小写 `asc` 转成 `ASC`，其余传入值转成 `DESC` |

转换规则不是严格的原始字符串校验，例如 `page=2abc` 会被解析成 2；`order=ASC` 也会转成 `DESC`。需要严格输入约束时使用业务 DTO。该类不执行查询，Service 仍需应用分页和排序。

全局 `ValidationPipe` 已在 `main.ts` 注册：开启 `transform`、`whitelist`、`stopAtFirstError`，校验失败使用 HTTP 422；未开启隐式类型转换。`whitelist` 根据 class-validator 装饰器保留属性，仅有 `@ApiProperty()` 不足以保留输入字段。

## DiscriminatedBodyPipe：按内容选择 DTO

`#/common/pipes/discriminated-body.pipe.js` 导出 `DiscriminatedBodyPipe` 和 `DtoResolverFn`。构造函数接收 DTO 选择函数及可选 `ValidationPipeOptions`，默认开启 `whitelist` 和 `transform`，适合同一路由接收多种请求体。

下面示例显式拒绝未知类型，并将 DTO 校验错误统一设为 HTTP 422：

```ts
import { Body, Controller, HttpCode, HttpStatus, Post, UnprocessableEntityException } from '@nestjs/common'
import { Equals, IsString } from 'class-validator'
import { ApiResult } from '#/common/decorators/api-result.decorator.js'
import { DiscriminatedBodyPipe } from '#/common/pipes/discriminated-body.pipe.js'

class TextDto {
  @Equals('text')
  kind!: 'text'

  @IsString()
  content!: string
}

class LinkDto {
  @Equals('link')
  kind!: 'link'

  @IsString()
  url!: string
}

const bodyPipe = new DiscriminatedBodyPipe((body) => {
  if (Array.isArray(body))
    throw new UnprocessableEntityException('请求体不能是数组')
  if (body.kind === 'text')
    return TextDto
  if (body.kind === 'link')
    return LinkDto
  throw new UnprocessableEntityException('不支持的 kind')
}, { errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })

@Controller('messages')
export class MessageController {
  @Post()
  @HttpCode(200)
  @ApiResult({ type: Boolean })
  create(@Body(bodyPipe) body: TextDto | LinkDto) {
    // 在此交给业务服务处理已转换和校验的 body。
    return body.kind === 'text' || body.kind === 'link'
  }
}
```

注意以下边界：

- 只对 `body` 动态选择 DTO，其他参数走父类管道逻辑。
- 空值或非 object 输入、无法解析 DTO 时抛 HTTP 422；数组属于 object，需在选择函数中自行拒绝。
- 管道实例的选项不会继承全局管道配置。未传 `errorHttpStatusCode` 时，所选 DTO 的校验失败默认是 HTTP 400。
- 全局管道先于参数管道运行；联合类型让示例中的运行时元类型为 Object，避免在选择 DTO 前先按某个具体 DTO 剔除字段。
- 它不会自动生成 Swagger `oneOf` 请求体文档；对外暴露多种输入时，应另用 `ApiExtraModels`、`ApiBody` 与 `getSchemaPath` 描述分支。

## 响应封装与业务异常

### SkipResponseTransform：返回原始数据

从 `#/common/decorators/skip-response-transform.decorator.js` 导入，用于文件下载、流或自定义响应方法：

```ts
import { Controller, Get } from '@nestjs/common'
import { SkipResponseTransform } from '#/common/decorators/skip-response-transform.decorator.js'

@Controller('raw')
export class RawController {
  @Get()
  @SkipResponseTransform()
  read() {
    return { status: 'ok' }
  }
}
```

该方法直接返回 `{ status: 'ok' }`。当前拦截器只读取方法元数据，标在类上不会生效。它也会跳过该拦截器中的 `qs` 查询重解析，但不会关闭认证、其他拦截器或异常过滤器。此类接口应自行描述原始响应 Schema，不使用描述统一封装的 `ApiResult`。

### ResOp 与分页响应类

`dto/response.dto.ts` 提供 `ResOp.success(data, message?)`、`ResOp.error(code, message?, errors?)`、`Pagination`、`ResultDataAndTotalDto` 和 `ApiResultOptions`。`ResOp` 包含 `code/data/message/success/traceId`，失败时附带 `errors`，traceId 从当前追踪上下文读取。

普通控制器返回业务值即可，手动返回 `ResOp.success()` 会被全局拦截器再次包裹。需要报错时抛异常，让过滤器同时设置 HTTP 状态和响应体。`dto/error-code.dto.ts` 中的 `ErrorCodeDto` 用于 Swagger 错误码模型。

### BusinessException 与 ERROR_CODES

```ts
import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'

throw new BusinessException(
  ERROR_CODES.USER_NOT_FOUND,
  '指定用户不存在',
  HttpStatus.NOT_FOUND,
)
```

签名为 `BusinessException(error, message?, statusCode?)`。HTTP 状态优先使用显式参数，其次使用错误项的 `httpStatus`，最后默认 400；业务码来自 `error.code`。上例返回 HTTP 404 和业务码 `20001`。错误项类型 `ErrorCodeItem` 与集中错误码 `ERROR_CODES` 都在 `constants/error-code.constant.ts`。

`CatchEverythingFilter` 已全局注册：HTTP 异常发送统一错误响应，WebSocket 异常通过 `error` 事件发送。普通 `HttpException` 使用 HTTP 状态作为响应业务码，`BusinessException` 保留业务码。完整成功/失败结构见 [请求处理链路](/architecture/request-lifecycle)。

## 全局组件与启动设施

这些组件已由框架入口接入，业务控制器通常无需重复注册。

| 组件 | 注册位置与行为 |
| --- | --- |
| `TransformInterceptor` | `app.module.ts`；HTTP 请求用 `qs` 重解析查询参数，返回值封装成 `ResOp.success(data ?? null)`，非 HTTP 跳过 |
| `LoggingInterceptor` | `main.ts`；以 debug 级别记录请求与返回数据、耗时，`Accept` 恰为 `text/event-stream` 时跳过响应日志 |
| `TraceMiddleware` | `app.module.ts`；复用 `x-trace-id`、其次 `x-request-id`，否则生成 UUID，并设置响应头和 AsyncLocalStorage 上下文 |
| `CatchEverythingFilter` | `app.module.ts`；统一 HTTP / WebSocket 异常 |
| 全局 `ValidationPipe` | `main.ts`；执行 DTO 转换和校验 |
| `ClassSerializerInterceptor` | `app.module.ts`；Nest 提供的全局序列化组件 |

`adapters/fastify.adapter.ts` 导出已创建的 `fastifyApp`，配置代理信任、请求超时、Helmet、multipart、Cookie 和请求 hook。它有创建应用的副作用，普通业务模块不应作为工具函数导入；文件上传详见 [系统附件](/modules/attachments)。

`setup/` 中的文档初始化状态如下：

| 函数 | 当前状态 |
| --- | --- |
| `setupSwagger` | `main.ts` 已调用；受 Swagger enable 配置控制，注册 `auth` 认证方案与基础模型，并返回启动日志回调 |
| `setupAsyncApi` | 实现文件保留，但 `main.ts` 的导入和调用均被注释，当前不会开放 `/async-api` |
| `setupWsSwagger` | 启动调用被注释，Gateway 扫描代码也是占位，当前不会提供可用的 WS 事件文档 |

Swagger 地址和配置见 [配置说明](/guide/configuration)，具体接口以运行中的 Swagger/OpenAPI 为准。

## 基础实体与常量

`entity/common.entity.ts` 中的 `CommonEntity` 继承 TypeORM `BaseEntity`，提供 bigint 字符串主键 `id`、创建/更新/软删除时间及可空的 `createdBy`、`updatedBy` bigint 审计字段。审计用户字段需要业务逻辑填充，继承不会自动读取当前登录用户。公开响应继续使用专用 DTO。

| 文件 | 导出与含义 |
| --- | --- |
| `constants/cache.constant.ts` | `CAHCE_TTL`：SHORT=60、DEFAULT=3600、LONG=86400；`CACHE_JITTER.DEFAULT`=600，均以秒计；`NULL_PLACEHOLDER` 为 `__NULL__`。导出名当前确为 `CAHCE_TTL` |
| `constants/response.constant.ts` | `ContentTypeEnum`：JSON、URL encoded、multipart 的 Content-Type 常量 |
| `constants/logger.constant.ts` | `COMMON_LOGGER`：上下文名为 `Common` 的 Nest Logger |

缓存常量不会自动实施缓存策略，使用方式见 [数据与缓存](/modules/data-cache)。
