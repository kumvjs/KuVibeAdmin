# Docker 运行与部署

Docker 配置运行本项目的 NestJS 后端、PostgreSQL 18.6 和 Redis 8。Vben 前端仍独立接入。需要已启动的 Docker Engine / Docker Desktop 和 Docker Compose v2 或更新版本；初始化辅助命令需要 Node.js 24（pnpm 已固定在镜像内部）。

## 首次本地启动

在仓库根目录执行：

```bash
node scripts/docker-init.mjs
docker compose build backend
docker compose up -d --wait postgres redis
docker compose run --rm migrate
docker compose run --rm setup
docker compose up -d --wait backend
```

`node scripts/docker-init.mjs` 从 `.env.docker.example` 创建根目录 `.env`，为 PostgreSQL、Redis、Access Token 和 Refresh Token 各生成独立随机密钥；已有 `.env` 时拒绝覆盖。该文件已被 Git 忽略，且不会进入镜像。容器配置由 Compose 显式注入，不读取宿主机的 `packages/backend/.env.local`。

只使用 Docker 时，可复制 `.env.docker.example` 为根目录 `.env`，自行填入四个独立随机密钥，然后依次使用 `docker compose build backend`、`docker compose up -d --wait postgres redis`、`docker compose run --rm migrate`、`docker compose run --rm setup`、`docker compose up -d --wait backend`。

初始化会交互创建管理员，用户名 5–100 位、密码 6–128 位，不提供默认账号密码。`setup` 使用当前环境的空临时文件满足既有脚本读取要求；签名密钥来自 Compose 环境，不依赖容器内生成的密钥。初始化规则和团队迁移提示词见[快速开始](getting-started.md#团队统一使用方式)。

默认访问：

- 后端：`http://localhost:7001`，API 前缀 `/api`。
- Swagger：`http://localhost:7001/api-docs`。
- HTTP 健康检查：`http://localhost:7001/api/timezone/getTimezoneOptions`，检查真实响应及 `success` 字段；它验证 HTTP 就绪，不代表每次均探测数据库/Redis 连通性。

本地 Compose 默认 `NODE_ENV=local`，运行编译产物，提供本地 Cookie/HTTP 配置和非生产 Playground，不开启源码监听。修改代码后重新执行 `docker compose build backend` 和 `docker compose up -d --wait backend`。

## 配置与持久化

### 源码热更新开发环境

开发环境使用独立 Compose 项目 `kuvibe-admin-dev`、根 `.env.docker.dev` 和独立数据卷，默认后端 `http://localhost:17001`、PostgreSQL `127.0.0.1:55432`、Redis `127.0.0.1:56379`。数据库/Redis端口只绑定回环地址，开发密钥与本地/生产配置分开。

```bash
node scripts/docker-init.mjs --dev
node scripts/docker-dev.mjs build backend
node scripts/docker-dev.mjs up -d --wait postgres redis
node scripts/docker-dev.mjs run --rm migrate
node scripts/docker-dev.mjs run --rm setup
node scripts/docker-dev.mjs up -d --wait backend
```

`setup`交互创建管理员；不提供默认密码。源码和测试以只读bind mount进入容器，Nest watch编译产物写在容器内，Linux依赖不与宿主机node_modules混用。修改源码后自动编译/重启；新增模块目录后，若Windows挂载未触发重载，执行`node scripts/docker-dev.mjs restart backend`并等待编译完成。清单/锁文件或Dockerfile改变后重新build。Windows挂载使用TypeScript轮询监听。

```bash
node scripts/docker-dev.mjs logs -f backend
node scripts/docker-dev.mjs exec backend pnpm typecheck
node scripts/docker-dev.mjs exec backend pnpm test --runInBand
node scripts/docker-dev.mjs ps
node scripts/docker-dev.mjs down
```

Swagger地址为`http://localhost:17001/api-docs`。`down`保留数据；不要在开发过程中删除数据卷。修改实体不会自动建表，迁移仍显式审查/执行。专用积分测试库与开发库分开，测试不能清理开发用户/账本。

两个API与独立worker的账务并发验证、Linux兼容回归和恢复操作见[账务运维与开发验收](../modules/billing-operations.md)。

### Docker Desktop 无法共享源码目录

若 Desktop 目录挂载报 `operation not permitted`，在前端覆盖文件之后追加 `compose.dev.snapshot.yaml`，使用镜像内的当前源码；保留相同的独立开发项目、密钥、数据库、Redis、附件和公开资源卷。修改代码后重新构建、重建服务，不采用宿主源码热更新：

```sh
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml build backend frontend
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml run --rm migrate
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml run --rm setup
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml up -d --wait backend frontend
```

后续 `exec`、`logs`、`ps` 和测试也沿用两个覆盖文件。开发镜像内包含应用测试，生产镜像仍只带生产运行产物；新增配置仅用于开发镜像和目录访问受限环境。

此模式使用 `billing-secrets` 命名卷替代宿主支付配置挂载；需要联调真实渠道时将安全配置和密钥复制到该卷对应的容器路径，再设置 `BILLING_CONFIG_FILE` 并重建后端，仍遵循[支付配置](../modules/recharge.md#微信与支付宝接入)。不配置时渠道继续关闭。

Docker Hub 无法访问而 AWS 公共官方镜像仓库可用时，可在忽略的 `.env.docker.dev` 设置 `NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim`。前后端开发镜像均读取此构建参数，默认仍使用 Docker Hub 标签。后端 Dockerfile 使用 Docker 内置构建前端，减少独立拉取 Dockerfile 语法镜像的要求；保留 BuildKit 缓存安装与冻结锁文件。

`packages/frontend/playground` 的积分、充值与订单页面使用 `compose.dev.frontend.yaml` 加入同一开发项目，入口 `http://localhost:5999`，源码热更新且通过同源 `/api` 访问后端。启动命令和权限说明见[积分与充值前端](../frontend/billing.md)。后续操作包含此前已启动的前端时沿用该覆盖文件，避免将它识别为孤立服务；不要使用 `--remove-orphans` 清理仍在使用的开发服务。

覆盖文件的合并方式参见[Docker Compose文档](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)，只读源码挂载参见[bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)。

| 配置 | 默认值 / 行为 |
| --- | --- |
| `DOCKER_HTTP_BIND` / `DOCKER_HTTP_PORT` | `127.0.0.1:7001`，仅发布后端；容器内部 `APP_PORT` 固定为 `7001` |
| `APP_BASE_URL` | 浏览器看到的 API 地址；改宿主机端口时同步修改 |
| `APP_CORS_ORIGINS` | 默认允许 Vben 的 `localhost:5999`、`localhost:5555`；填准确 Origin |
| `GLOBAL_PREFIX` | 默认 `api`；健康检查自动沿用，空值表示无前缀 |
| `POSTGRES_USER` / `POSTGRES_DB` | 新数据库默认 `ku_vibe_admin` |
| `POSTGRES_PASSWORD` / `REDIS_PASSWORD` | 必填；数据库、Redis 仅在 Compose 内部网络可达 |
| `JWT_SECRET` / `REFRESH_TOKEN_SECRET` | 必填、互相独立；重建容器时保留根 `.env` |
| `NODE_IMAGE` / `POSTGRES_IMAGE` / `REDIS_IMAGE` | 默认 Node.js 24 Debian slim / PostgreSQL 18.6 bookworm / Redis 8；发布时可固定经过验证的 tag/digest |

数据卷保存 PostgreSQL 数据、Redis AOF、私有附件 `/app/var/attachments` 和公开静态资源 `/app/public`。附件与公开目录独立，应用以 `node` 普通用户运行，新卷从镜像目录继承权限。迁移、setup 工具容器复用后端镜像，不安装开发工具。已有宿主机附件需单独复制至附件卷并保留 `node` 用户权限，同时迁移对应数据库记录。

镜像分离编译依赖与生产依赖，仅使用 `packages/backend/pnpm-lock.yaml` 冻结安装，并沿用根 `pnpm-workspace.yaml` 的原生依赖许可。镜像包含编译后的迁移与初始化脚本，以 `node dist/src/main.js` 启动。构建上下文只允许清单、锁文件、配置、源码和健康检查进入，宿主机 `.env`、`node_modules`、历史附件、文档和 Git 数据均被排除。构建缓存与多阶段结构参考 [pnpm Docker 指南](https://pnpm.io/docker)。

按用户指定固定 PostgreSQL `18.6`，不使用浮动 `latest`。官方镜像的 PostgreSQL 18 默认 `PGDATA=/var/lib/postgresql/18/docker`，数据卷必须挂载至 `/var/lib/postgresql`；本配置已采用该布局，参见 [PostgreSQL 官方镜像说明](https://hub.docker.com/_/postgres)。

## 日常运行与升级

```bash
docker compose ps
docker compose logs -f backend
docker compose logs postgres redis
docker compose down
```

`docker compose down` 保留数据卷，下次 `docker compose up -d --wait backend` 会复用数据。`docker compose down -v` 会删除本项目的数据卷，包括数据库和附件，只适合明确需要清空的临时环境。不要因修改 PostgreSQL 密码而重建数据库卷：已有卷不重新应用 `POSTGRES_*` 初始化变量，应先通过数据库管理流程修改凭据，再同步 `.env`。

迁移与初始化属于显式工具命令，不在应用启动或容器重启时自动执行。Compose 等待 PostgreSQL/Redis 健康后启动后端；首次启动必须先完成迁移和 setup。依赖等待采用 [Docker 官方启动顺序规则](https://docs.docker.com/compose/how-tos/startup-order/)。

已有部署升级时，在维护窗口停止后端、备份并确认数据库及附件可恢复，审查待执行迁移后再运行：

```bash
docker compose stop backend
docker compose build backend
docker compose run --rm migrate node node_modules/typeorm/cli.js -d dist/src/config/database.config.js migration:show
docker compose run --rm migrate
docker compose run --rm setup
docker compose up -d --wait backend
```

工具容器通过直接调用编译后的 TypeORM CLI 沿用 Compose 的 `NODE_ENV`，避免现有 pnpm migration/setup 脚本强制切换至 local。`TYPEORM_SYNCHRONIZE` 固定为 `false`。时间迁移 `1789648814246` 对历史 UTC 语义、排他锁和生产规模验证的要求仍适用，详细审查与恢复流程见[快速开始](getting-started.md)。新增迁移 `1790744400000` 为 13 张表补齐实体已预留的 `tenant_id bigint NOT NULL DEFAULT 1`，解决全新迁移库无法 setup 的问题。默认值来自现有 `CommonEntity`，不新增租户隔离能力。迁移仍需排他锁；已有列的数据库应先核对实体/迁移历史，不直接重跑或删列绕过冲突。回滚会锁定并检查全部表，发现非 `1` 租户数据时拒绝删列。需要回退应用时保留旧镜像 tag；数据库回滚先验证兼容性，不能直接以旧镜像搭配任意新 schema。

## 生产环境

部署前在根 `.env` 明确设置：

```dotenv
NODE_ENV=production
APP_BASE_URL=https://api.example.com
APP_CORS_ORIGINS=https://admin.example.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=lax
SWAGGER_ENABLE=false
```

所有公开地址和浏览器 Origin 必须使用 HTTPS。由可信反向代理终止 TLS，并将 WebSocket 升级请求及 API 转发至 `127.0.0.1:7001`。若代理在其他容器中，需将其接入本项目网络并转发至 `backend:7001`。前后端跨站时采用 `AUTH_COOKIE_SAME_SITE=none`，继续保持 Secure；Cookie Domain 默认留空。调整网络绑定时只开放所需入口。

该配置提供单机部署基础，不代替生产数据库高可用、备份、监控或生产规模迁移演练。本地验收只涉及新建隔离环境，不证明已有生产数据库可直接升级。PostgreSQL 主版本变更需要正式数据升级流程，不能只修改 `POSTGRES_IMAGE`；如果改为 17 或更早版本，也必须按对应官方镜像重新审查数据卷路径。
