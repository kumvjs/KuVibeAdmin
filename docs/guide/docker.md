# Docker 运行与部署

按「快速本地启动 → 修改后生效 → 生产部署」使用本页。所有命令在仓库根目录执行，需要 Node.js 24、已启动的 Docker Engine / Docker Desktop，以及支持 `!override` / `!reset` 的 Docker Compose。pnpm 已安装在开发镜像中。

| 场景 | 命令入口 | 环境文件 / 项目 | 前端 |
| --- | --- | --- | --- |
| 本地开发（推荐） | `node scripts/docker-dev.mjs -f compose.dev.frontend.yaml …` | `.env.docker.dev` / `kuvibe-admin-dev` | Vite 容器，支持热更新 |
| 后端编译产物 / 生产 | `docker compose …` | 根 `.env` / `kuvibe-admin` | 不包含前端服务；生产单独发布静态文件 |

两个项目使用独立数据卷，不要混用命令。开发前端启动后，后续操作继续带上 `-f compose.dev.frontend.yaml`。

## 快速本地启动

### 源码热更新开发环境

首次启动完整前后端：

```bash
# 1. 创建开发配置和随机密钥；已有 .env.docker.dev 时跳过
node scripts/docker-init.mjs --dev

# 2. 构建前后端
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml build backend frontend

# 3. 启动 PostgreSQL、Redis、RabbitMQ
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait postgres redis rabbitmq

# 4. 执行数据库迁移
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml run --rm migrate

# 5. 初始化基础数据，交互创建管理员
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml run --rm setup

# 6. 启动前后端
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait backend frontend
```

每一步成功后再执行下一步。登录使用自己创建的管理员，页面示例账号不代表数据库已有该账号。`docker-init` 不覆盖已有配置，容器不读取宿主机 `packages/backend/.env.local`。

| 入口 | 默认地址 |
| --- | --- |
| 前端 | `http://localhost:5999` |
| 后端 / Swagger | `http://localhost:17001` / `http://localhost:17001/api-docs` |
| RabbitMQ 管理界面 | `http://localhost:15673`，凭据见 `.env.docker.dev` |
| 宿主 PostgreSQL / Redis / AMQP | `127.0.0.1:55432` / `127.0.0.1:56379` / `127.0.0.1:5673` |

已有环境再次启动直接执行第 6 步；有新迁移时先按后文升级。只开发后端可以去掉前端覆盖文件和 `frontend` 服务名。页面及权限见[积分与充值前端](../frontend/billing.md)。

```bash
# 状态、日志
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml ps
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml logs -f backend frontend

# 停止并移除容器，保留数据卷
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml down
```

### 本地运行后端编译产物

需要验证后端运行镜像时使用普通 Compose，不挂载源码：

```bash
node scripts/docker-init.mjs
docker compose build backend
docker compose up -d --wait postgres redis rabbitmq
docker compose run --rm migrate
docker compose run --rm setup
docker compose up -d --wait backend
```

已有根 `.env` 时跳过初始化配置步骤。默认后端 `http://localhost:7001`、Swagger `http://localhost:7001/api-docs`、RabbitMQ 管理界面 `http://localhost:15672`；数据库和 Redis 不发布宿主端口。

## 修改后如何生效

### 修改类型速查

| 修改内容 | 开发热更新模式 | 编译产物 / 生产模式 |
| --- | --- | --- |
| 已挂载的后端 `src`、前端 `playground/src` | 保存后自动编译 / 刷新 | 后端重建镜像；前端重新构建并发布 |
| 依赖清单、锁文件、Dockerfile | 重建对应镜像和容器 | 同左 |
| 未挂载的前端共享包、其他构建输入 | 重建前端镜像和容器 | 重新构建并发布前端 |
| 根环境文件中 Compose 引用的变量 | `up` 重建受影响容器 | 同左 |
| Compose 配置 | `up` 重建受影响服务，涉及构建时先 `build` | 同左 |
| 实体 / 数据库结构 | 生成、审查并执行迁移 | 执行已审查的迁移，不在生产生成 |
| 种子菜单、权限、默认任务 | 停服运行 `setup` | 同左，安排维护窗口 |

`build` 更新镜像，`up` 让新镜像和配置生效；仅 `restart` 不会更新镜像或容器环境变量。参见 [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) 和 [Compose restart](https://docs.docker.com/reference/cli/docker/compose/restart/)。

### 更新前后端容器

需要重建时，按实际修改的服务执行下面一组命令：

```bash
# 只更新后端
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml build backend
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait backend

# 只更新前端
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml build frontend
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait frontend

# 同时更新前后端（有新迁移时先执行后面的数据库升级）
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml build backend frontend
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait backend frontend
```

普通 Compose 后端更新：

```bash
docker compose build backend
docker compose up -d --wait backend
```

只修改根环境配置、无需构建镜像时：

```bash
# 开发环境 .env.docker.dev
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait --force-recreate backend frontend

# 普通 Compose / 生产 .env
docker compose up -d --wait --force-recreate backend
```

前端镜像内的 `.env` 修改需要重建镜像；宿主前端 `.env` 不会自动传入容器。新增后端目录未触发监听时，可以执行 `node scripts/docker-dev.mjs -f compose.dev.frontend.yaml restart backend`。

### 数据库迁移与基础数据

**启动、热更新、重建和重启不会自动执行迁移。** `migrate` 改表结构，`setup` 补基础数据；`TYPEORM_SYNCHRONIZE` 始终为 `false`。

已有新迁移文件时，开发环境按以下顺序执行；升级前备份数据库，每步失败都停止后续操作：

```bash
# 1. 停止应用写入
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml stop backend

# 2. 依赖或镜像输入有变更时先 build backend
# 查看迁移状态：工具容器先编译当前源码
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml run --rm migrate sh -c 'pnpm build && exec node node_modules/typeorm/cli.js -d dist/src/config/database.config.js migration:show'

# 3. 执行所有待应用迁移
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml run --rm migrate

# 4. 版本涉及基础菜单 / 权限 / 默认任务更新时执行
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml run --rm setup

# 5. 恢复服务
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait backend frontend
```

`migration:show` 的 `[X]` 表示已执行，`[ ]` 表示待执行。开发工具容器会编译挂载源码；普通 Compose 工具使用镜像中的编译迁移，因此普通 Compose 升级必须先构建新后端镜像，见生产升级流程。

修改实体、需要生成迁移时，按[团队统一使用方式](getting-started.md#团队统一使用方式)让 Agent 完成生成、数据保留审查、隔离库验证和部署影响检查。手动生成候选文件的开发命令如下（Bash / zsh）：

```bash
# 临时给迁移输出目录写权限，生成文件写回仓库
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml run --rm --volume "$PWD/packages/backend/src/migrations:/app/src/migrations" migrate sh -c 'pnpm build && exec node node_modules/typeorm/cli.js -d dist/src/config/database.config.js migration:generate ./src/migrations/update-table'
```

该命令比较开发数据库实际结构与当前实体，先确认基线一致。生成成功只得到候选迁移，审查通过再执行。部署已有迁移无需再次生成；容器直接调用 TypeORM CLI 保留 `NODE_ENV`，现有 `pnpm migration:*` 脚本强制使用 `local`，不作为生产入口。

## 生产部署流程

以单机同源 HTTPS 站点 `https://admin.example.com` 为例：宿主 Nginx 托管前端静态文件，代理 `/api` 至 `127.0.0.1:7001`。域名、证书和目录按实际环境替换。

当前没有业务前端生产 Compose 服务；`compose.dev.frontend.yaml` 运行 Vite 开发服务器。生产单独构建 Playground 静态产物，上游 `scripts/deploy` 模板缺少本项目 API 代理，不能直接作为完整业务部署配置。

### 首次部署

**1. 创建根环境配置。** 执行 `node scripts/docker-init.mjs`，编辑根 `.env`，保留生成的五项独立密钥：

```dotenv
NODE_ENV=production
DOCKER_HTTP_BIND=127.0.0.1
DOCKER_HTTP_PORT=7001
APP_BASE_URL=https://admin.example.com
APP_CORS_ORIGINS=https://admin.example.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_DOMAIN=
SWAGGER_ENABLE=false
```

生产不叠加开发覆盖文件。前后端分域时，按真实 API 地址 / 前端 Origin 设置 `APP_BASE_URL` / `APP_CORS_ORIGINS`；跨站 Cookie 使用 `SameSite=none` 并保持 `Secure=true`。

**2. 部署后端和空数据库。** 每步成功后再继续；已有业务库使用下面的升级流程：

```bash
docker compose build backend
docker compose up -d --wait postgres redis rabbitmq
docker compose run --rm migrate
docker compose run --rm setup
docker compose up -d --wait backend
```

**3. 构建前端。** 在有 Node.js 和项目所固定 pnpm 的构建机执行（Bash / zsh）：

```bash
pnpm --dir packages/frontend install --frozen-lockfile
VITE_GLOB_API_URL=/api VITE_KUVIBE_API_URL=/api pnpm --dir packages/frontend/playground build
```

前端使用独立工作区 / 锁文件，产物为 `packages/frontend/playground/dist`。显式覆盖 API 地址避免使用上游示例地址；环境变量在构建时生效，修改后重新构建，见 [Vite 环境变量](https://vite.dev/guide/env-and-mode)。

**4. 发布静态文件并配置 HTTPS 代理。** 下面以构建与部署在同一台 Linux 主机为例；远程构建时同步同一份 `dist/` 到部署机即可：

```bash
sudo install -d /srv/kuvibe-admin/frontend
sudo rsync -a --delete packages/frontend/playground/dist/ /srv/kuvibe-admin/frontend/
```

该目录只保存构建产物，`--delete` 会移除旧产物。升级前保留上一版静态文件。在已有 HTTPS Nginx `server` 中配置（证书和 TLS 监听按部署环境设置）：

```nginx
root /srv/kuvibe-admin/frontend;
index index.html;

location / {
    try_files $uri $uri/ /index.html;
}
location = /index.html {
    add_header Cache-Control "no-cache";
}
location /api/ {
    # 不带末尾斜杠，保留后端 /api 前缀
    proxy_pass http://127.0.0.1:7001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

`proxy_pass` 不附带 URI 时保留请求路径，见 [Nginx 代理说明](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)。公开资源和 WebSocket 按实际路径增加代理及 Upgrade 配置。代理在另一容器时，将其接入后端网络，目标改为 `backend:7001`。

```bash
sudo nginx -t
sudo nginx -s reload
curl --fail https://admin.example.com/api/timezone/getTimezoneOptions
```

确认 `success=true`，再检查真实登录、刷新 Cookie、菜单及业务读写。HTTP 健康检查不代表完整依赖或业务验收。

### 已有部署升级

先取到已验收版本，审查待执行迁移的旧数据、锁等待、耗时和兼容性，并在隔离数据库演练升级及恢复。先构建新前端、保留上一版产物，后端按下面顺序升级：

```bash
# 1. 保留旧镜像，提前构建新镜像
docker image tag kuvibe-admin-backend:local kuvibe-admin-backend:rollback
docker compose build backend

# 2. 维护窗口暂停入口及所有写入者，停止本项目后端
docker compose stop backend
```

**3. 备份并确认可恢复。** 以下为 Bash / zsh 示例；每次使用独立目录，并另行保存支付配置、上一版前端及消息恢复所需资料：

```bash
umask 077
backup_dir="/srv/kuvibe-admin/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
docker compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T backend tar -czf - -C /app var/attachments public > "$backup_dir/files.tar.gz"
cp .env "$backup_dir/compose.env"
```

备份目录含敏感数据，按生产备份策略保存；临时后端容器只运行 `tar`，不启动应用。开发项目备份时，将上述 `docker compose` 替换成带前端覆盖文件的 `node scripts/docker-dev.mjs`，并备份 `.env.docker.dev`。先确认备份成功和恢复演练结果，再继续：

```bash
# 4. 查看并执行待应用迁移
docker compose run --rm migrate node node_modules/typeorm/cli.js -d dist/src/config/database.config.js migration:show
docker compose run --rm migrate

# 5. 本次版本涉及基础菜单 / 权限 / 默认任务更新时执行
docker compose run --rm setup

# 6. 恢复后端并检查
docker compose up -d --wait backend
docker compose ps
docker compose logs --tail=100 backend
```

**7. 发布同版本前端。** 按首次部署的静态文件发布步骤更新，完成 HTTPS / 登录 / 业务检查后再恢复入口。仅前端变更时构建并发布静态文件；无迁移和种子变更的后端更新使用前文 `build` + `up`。

任一步失败都保持维护状态。`setup` 重跑保留已有管理员、补齐基础数据；自定义数据冲突或权限缓存清理失败需处理后重跑，不通过清库绕过。

### 回退与恢复

旧应用兼容当前数据库和消息格式时，可回退后端镜像，再恢复对应前端产物：

```bash
docker image tag kuvibe-admin-backend:rollback kuvibe-admin-backend:local
docker compose up -d --wait --force-recreate backend
```

数据库回退单独审查；以下只回退最近一条迁移，不恢复 `setup` 或业务数据，不作为默认失败处理：

```bash
# 仅在停服、已备份且确认该 down 可执行时使用
docker compose run --rm migrate node node_modules/typeorm/cli.js -d dist/src/config/database.config.js migration:revert
```

不可逆或业务已依赖的新结构采用前向修复，或恢复数据库、文件及匹配应用版本。历史时间迁移需确认旧值时区语义；`tenant_id` 存在非 `1` 数据、任务表已有使用数据时会拒绝结构回退，不能强行删列 / 删表。审查标准见[团队统一使用方式](getting-started.md#团队统一使用方式)。

## 可选模式与配置说明

### Docker Desktop 无法共享源码目录

挂载报 `operation not permitted` 时，在前端覆盖文件后追加 `compose.dev.snapshot.yaml`，使用镜像内源码。首次配置仍先运行 `node scripts/docker-init.mjs --dev`：

```bash
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml build backend frontend
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml up -d --wait postgres redis rabbitmq
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml run --rm migrate
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml run --rm setup
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml -f compose.dev.snapshot.yaml up -d --wait backend frontend
```

此模式没有宿主源码热更新；代码修改后执行 `build` + `up`，新增迁移时先停服、备份再执行迁移。后续 `logs`、`exec`、测试和迁移查询均沿用两个覆盖文件。手动生成新迁移应在可写的开发环境进行。

支付配置使用 `billing-secrets` 卷；真实渠道联调需复制配置和密钥到容器对应路径，再设置 `BILLING_CONFIG_FILE` 并重建后端，见[支付配置](../modules/recharge.md#微信与支付宝接入)。Docker Hub 不可达而 AWS 官方公共镜像可用时，可在 `.env.docker.dev` 设置 `NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim` 后重建。

### 配置和数据保留

- 初始化创建五项独立随机密钥；已有旧配置缺少 RabbitMQ 时，开发运行 `node scripts/docker-init.mjs --dev --rabbitmq`，普通 Compose 运行 `node scripts/docker-init.mjs --rabbitmq`，保留已有非空凭据。容器配置由 Compose 显式注入，根环境文件不进入镜像。
- PostgreSQL、Redis AOF、RabbitMQ、私有附件 `/app/var/attachments` 和公开资源 `/app/public` 分别持久化。`down` 保留数据；`down -v` 删除数据库、消息和附件等数据卷，不用于日常更新。不要用 `--remove-orphans` 删除仍在使用的前端。
- 已有 PostgreSQL / RabbitMQ 卷不会因修改初始化环境变量自动修改用户密码；先通过对应服务的凭据管理流程修改，再同步环境配置。JWT 密钥日常重建时保留，轮换单独安排。
- 后端按 `packages/backend/pnpm-lock.yaml` 冻结安装，前端使用独立锁文件；应用以普通 `node` 用户运行，源码只读，Linux 依赖不与宿主 `node_modules` 混用。旧附件迁入卷需保留数据库记录和文件权限。
- 默认 Node.js 24 Debian slim、PostgreSQL 18.6-bookworm、Redis 8-bookworm、RabbitMQ 4.3.6-management，可通过对应 `*_IMAGE` 固定已验证的 digest。PostgreSQL 18 卷挂 `/var/lib/postgresql`；主版本升级需要正式数据升级流程，不能只改镜像标签。
- 容器内后端端口固定 `7001`，外部端口改变时同步 `APP_BASE_URL`。`GLOBAL_PREFIX` 默认 `api`，变更时同步前端与代理。生产仅开放所需入口，RabbitMQ 管理端口保持回环绑定。
- RabbitMQ 默认开启、预取 5、队列 `kuvibe.billing`；独立业务库使用不同队列。任务和账务恢复见[任务调度](../modules/task-scheduling.md)和[账务运维](../modules/billing-operations.md)。单机配置不替代生产规模迁移、备份恢复、高可用及真实支付渠道验收。
