# 配置说明

配置由 `@nestjs/config` 加载，顺序为 `.env.<NODE_ENV>`、`.env`；前者优先。Joi 在启动时校验数据库、Redis 与 JWT 等必需项。

Docker Compose 使用仓库根 `.env` 进行插值，并显式注入容器环境；该文件不会复制到镜像，也不使用宿主机 `packages/backend/.env.local`。容器环境优先于环境文件。完整步骤见 [Docker 部署](docker.md)。

## 应用与接口

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 可选 `development`、`production`、`local` |
| `APP_NAME` | 无 | Swagger 标题等场景使用 |
| `APP_PORT` | `3000` | HTTP 监听端口 |
| `APP_BASE_URL` | 无 | 对外服务地址 |
| `GLOBAL_PREFIX` | `api` | 全局 API 前缀 |
| `APP_LOCALE` | `zh-CN` | 应用语言配置，目前未接入 i18n |
| `APP_CORS_ORIGINS` | 本地 Vben 地址 | 逗号分隔的浏览器 Origin，不支持 `*`；生产必须显式填写且全部为 HTTPS |
| `SWAGGER_ENABLE` | `false` | 是否启用 Swagger |
| `SWAGGER_PATH` | 无 | Swagger 路径，例如 `api-docs` |
| `SWAGGER_SERVER_URL` | `APP_BASE_URL` | OpenAPI Server 地址 |

## PostgreSQL / TypeORM

| 变量 | 说明 |
| --- | --- |
| `TYPEORM_TYPE` | 本项目目标为 `postgres`，校验器也允许其他 TypeORM 驱动 |
| `TYPEORM_HOST` / `TYPEORM_PORT` | 数据库地址与端口 |
| `TYPEORM_USERNAME` / `TYPEORM_PASSWORD` | 数据库凭据 |
| `TYPEORM_DATABASE` / `TYPEORM_SCHEMA` | 数据库与 Schema |
| `TYPEORM_SYNCHRONIZE` | 是否自动同步实体；生产环境必须为 `false` |
| `DB_LOGGING` | TypeORM 日志选项，可传 JSON 数组等 TypeORM 支持值 |

## Redis 与令牌

| 变量 | 说明 |
| --- | --- |
| `REDIS_HOST` / `REDIS_PORT` | Redis 地址与端口 |
| `REDIS_PASSWORD` | Redis 密码，可为空 |
| `REDIS_DB` | Redis DB 编号，默认 `0` |
| `JWT_SECRET` | Access Token 签名密钥，必填 |
| `JWT_EXPIRE` | Access Token 有效秒数 |
| `REFRESH_TOKEN_SECRET` | Refresh Token 独立签名密钥 |
| `REFRESH_TOKEN_EXPIRE` | Refresh Token 有效秒数 |
| `AUTH_COOKIE_SECURE` | 生产 `true`，其他环境 `false` | 是否只通过 HTTPS 发送 Refresh Token Cookie；生产不能关闭 |
| `AUTH_COOKIE_SAME_SITE` | `lax` | 可选 `lax`、`strict`、`none`；`none` 必须同时启用 Secure |
| `AUTH_COOKIE_DOMAIN` | 无 | 可选 Cookie Domain；不设置时为更安全的 host-only Cookie |

Refresh Token Cookie 的 Path 根据 `GLOBAL_PREFIX` 固定到 `/<prefix>/auth`。登录、刷新和退出清理使用完全相同的 Cookie 属性，避免因 Path 或 Domain 不一致导致旧 Cookie 无法删除。

本地和开发环境未设置 `APP_CORS_ORIGINS` 时，默认允许 Vben playground 的 `localhost:5555` 与 Ant Design Vue 应用的 `localhost:5999`，并包含对应的 `127.0.0.1` Origin。生产环境没有隐式前端来源，且要求 `APP_BASE_URL`、所有 CORS Origin 使用 HTTPS。TLS 可以在可信反向代理终止，但浏览器访问到的公开 API URL 必须是 HTTPS。

所有带浏览器 `Origin` 的非安全方法都会在业务逻辑之前检查可信来源。CORS 决定浏览器能否读取响应，Origin 检查负责阻止跨站写入；无 Origin 的 CLI 和服务间请求继续可用。若前后端属于不同站点，需要配置 `AUTH_COOKIE_SAME_SITE=none`、`AUTH_COOKIE_SECURE=true`，并把准确的前端 Origin 加入 `APP_CORS_ORIGINS`。

## 日志

`LOGGER_LOG_LEVELS` 接收逗号分隔的 Nest 日志级别；`LOGGER_JSON`、`LOGGER_COLORS`、`LOGGER_TIMESTAMP`、`LOGGER_COMPACT`、`LOGGER_PREFIX` 和 `LOGGER_DEPTH` 控制控制台日志格式。

::: tip 配置现状
`multiDeviceLogin` 当前在 `app.config.ts` 中固定为 `true`，尚不能通过环境变量切换。Fastify cookie 签名 secret 也仍是代码常量，后续应移入安全配置。
:::
